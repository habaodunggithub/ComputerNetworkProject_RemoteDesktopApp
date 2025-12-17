#pragma once
#include <string>
#include <vector>
#include <nlohmann/json.hpp>
#include <windows.h>
#include <tlhelp32.h>
#include <pdh.h>
#include <pdhmsg.h>
#include <psapi.h>
#include <iphlpapi.h>
#include <wbemidl.h>
#include <algorithm>
#include <mutex>
#include <thread>
#include <chrono>
#include <atomic>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <cmath>

#pragma comment(lib, "pdh.lib")
#pragma comment(lib, "iphlpapi.lib")
#pragma comment(lib, "wbemuuid.lib")
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "oleaut32.lib")

using json = nlohmann::json;

class DeviceInfo
{
private:
    // CPU monitoring
    static PDH_HQUERY cpuQuery;
    static PDH_HCOUNTER cpuCounter;
    static bool cpuInitialized;

    // Network monitoring
    static uint64_t lastBytesRecv;
    static uint64_t lastBytesSent;
    static std::chrono::steady_clock::time_point lastNetTime;
    static double lastDownloadSpeed;
    static double lastUploadSpeed;

    static std::mutex initMutex;

    // WMI helpers
    static bool initWMI(IWbemLocator **pLoc, IWbemServices **pSvc)
    {
        HRESULT hres = CoInitializeEx(0, COINIT_MULTITHREADED);
        if (FAILED(hres) && hres != RPC_E_CHANGED_MODE)
            return false;

        hres = CoInitializeSecurity(NULL, -1, NULL, NULL,
                                    RPC_C_AUTHN_LEVEL_DEFAULT,
                                    RPC_C_IMP_LEVEL_IMPERSONATE,
                                    NULL, EOAC_NONE, NULL);

        hres = CoCreateInstance(CLSID_WbemLocator, 0,
                                CLSCTX_INPROC_SERVER,
                                IID_IWbemLocator, (LPVOID *)pLoc);
        if (FAILED(hres))
            return false;

        BSTR bstrNamespace = SysAllocString(L"ROOT\\CIMV2");
        hres = (*pLoc)->ConnectServer(bstrNamespace,
                                      NULL, NULL, NULL, 0, NULL, NULL, pSvc);
        SysFreeString(bstrNamespace);
        
        if (FAILED(hres))
        {
            (*pLoc)->Release();
            return false;
        }

        hres = CoSetProxyBlanket(*pSvc, RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE,
                                 NULL, RPC_C_AUTHN_LEVEL_CALL,
                                 RPC_C_IMP_LEVEL_IMPERSONATE, NULL, EOAC_NONE);
        return SUCCEEDED(hres);
    }

    static void cleanupWMI(IWbemLocator *pLoc, IWbemServices *pSvc)
    {
        if (pSvc)
            pSvc->Release();
        if (pLoc)
            pLoc->Release();
    }

    static std::string WideToUtf8(const std::wstring &ws)
    {
        if (ws.empty())
            return "";
        int len = WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), -1, nullptr, 0, nullptr, nullptr);
        std::string out(len - 1, 0);
        WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), -1, &out[0], len, nullptr, nullptr);
        return out;
    }
    
    static std::string BstrToUtf8(BSTR bstr)
    {
        if (!bstr) return "";
        return WideToUtf8(std::wstring(bstr, SysStringLen(bstr)));
    }

public:
    // ==================== CPU INFO ====================
    static json getCpuInfo()
    {
        json result;

        IWbemLocator *pLoc = nullptr;
        IWbemServices *pSvc = nullptr;

        if (initWMI(&pLoc, &pSvc))
        {
            IEnumWbemClassObject *pEnumerator = nullptr;
            BSTR bstrWQL = SysAllocString(L"WQL");
            BSTR bstrQuery = SysAllocString(L"SELECT Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed FROM Win32_Processor");
            
            HRESULT hres = pSvc->ExecQuery(bstrWQL, bstrQuery,
                WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
                NULL, &pEnumerator);
            
            SysFreeString(bstrWQL);
            SysFreeString(bstrQuery);

            if (SUCCEEDED(hres))
            {
                IWbemClassObject *pclsObj = nullptr;
                ULONG uReturn = 0;

                if (pEnumerator->Next(WBEM_INFINITE, 1, &pclsObj, &uReturn) == S_OK)
                {
                    VARIANT vtProp;

                    if (SUCCEEDED(pclsObj->Get(L"Name", 0, &vtProp, 0, 0)))
                    {
                        result["name"] = BstrToUtf8(vtProp.bstrVal);
                        VariantClear(&vtProp);
                    }

                    if (SUCCEEDED(pclsObj->Get(L"NumberOfCores", 0, &vtProp, 0, 0)))
                    {
                        result["cores"] = vtProp.intVal;
                        VariantClear(&vtProp);
                    }

                    if (SUCCEEDED(pclsObj->Get(L"NumberOfLogicalProcessors", 0, &vtProp, 0, 0)))
                    {
                        result["threads"] = vtProp.intVal;
                        VariantClear(&vtProp);
                    }

                    if (SUCCEEDED(pclsObj->Get(L"MaxClockSpeed", 0, &vtProp, 0, 0)))
                    {
                        result["maxClockSpeedMHz"] = vtProp.intVal;
                        VariantClear(&vtProp);
                    }

                    pclsObj->Release();
                }
                pEnumerator->Release();
            }
            cleanupWMI(pLoc, pSvc);
        }

        return result;
    }

    static double getCpuUsage()
    {
        std::lock_guard<std::mutex> lock(initMutex);

        if (!cpuInitialized)
        {
            PdhOpenQuery(NULL, 0, &cpuQuery);
            PdhAddEnglishCounterW(cpuQuery, L"\\Processor(_Total)\\% Processor Time", 0, &cpuCounter);
            PdhCollectQueryData(cpuQuery);
            cpuInitialized = true;
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }

        PDH_FMT_COUNTERVALUE counterVal;
        PdhCollectQueryData(cpuQuery);
        PdhGetFormattedCounterValue(cpuCounter, PDH_FMT_DOUBLE, NULL, &counterVal);

        return counterVal.doubleValue;
    }

    static double getCpuTemperature()
    {
        IWbemLocator *pLoc = nullptr;
        IWbemServices *pSvc = nullptr;
        double temp = -1.0;

        HRESULT hres = CoInitializeEx(0, COINIT_MULTITHREADED);
        if (FAILED(hres) && hres != RPC_E_CHANGED_MODE)
            return temp;

        hres = CoCreateInstance(CLSID_WbemLocator, 0, CLSCTX_INPROC_SERVER,
                                IID_IWbemLocator, (LPVOID *)&pLoc);
        if (FAILED(hres))
            return temp;

        BSTR bstrWMI = SysAllocString(L"ROOT\\WMI");
        hres = pLoc->ConnectServer(bstrWMI, NULL, NULL, NULL, 0, NULL, NULL, &pSvc);
        SysFreeString(bstrWMI);
        
        if (SUCCEEDED(hres))
        {
            CoSetProxyBlanket(pSvc, RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE,
                              NULL, RPC_C_AUTHN_LEVEL_CALL,
                              RPC_C_IMP_LEVEL_IMPERSONATE, NULL, EOAC_NONE);

            IEnumWbemClassObject *pEnumerator = nullptr;
            BSTR bstrWQL = SysAllocString(L"WQL");
            BSTR bstrQuery = SysAllocString(L"SELECT CurrentTemperature FROM MSAcpi_ThermalZoneTemperature");
            
            hres = pSvc->ExecQuery(bstrWQL, bstrQuery,
                WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
                NULL, &pEnumerator);
            
            SysFreeString(bstrWQL);
            SysFreeString(bstrQuery);

            if (SUCCEEDED(hres) && pEnumerator)
            {
                IWbemClassObject *pclsObj = nullptr;
                ULONG uReturn = 0;

                if (pEnumerator->Next(WBEM_INFINITE, 1, &pclsObj, &uReturn) == S_OK)
                {
                    VARIANT vtProp;
                    if (SUCCEEDED(pclsObj->Get(L"CurrentTemperature", 0, &vtProp, 0, 0)))
                    {
                        temp = (vtProp.intVal / 10.0) - 273.15;
                        VariantClear(&vtProp);
                    }
                    pclsObj->Release();
                }
                pEnumerator->Release();
            }
        }

        cleanupWMI(pLoc, pSvc);
        return temp;
    }

    // ==================== GPU INFO ====================
    static json getGpuInfo()
    {
        json result;
        result["gpus"] = json::array();
        
        IWbemLocator *pLoc = nullptr;
        IWbemServices *pSvc = nullptr;

        if (initWMI(&pLoc, &pSvc))
        {
            IEnumWbemClassObject *pEnumerator = nullptr;
            BSTR bstrWQL = SysAllocString(L"WQL");
            // GIẢM BỚT QUERY ĐỂ TRÁNH LỖI DRIVER
            BSTR bstrQuery = SysAllocString(L"SELECT Name, AdapterRAM, DriverVersion FROM Win32_VideoController");
            
            HRESULT hres = pSvc->ExecQuery(bstrWQL, bstrQuery,
                WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
                NULL, &pEnumerator);
            
            SysFreeString(bstrWQL);
            SysFreeString(bstrQuery);

            if (SUCCEEDED(hres))
            {
                IWbemClassObject *pclsObj = nullptr;
                ULONG uReturn = 0;

                while (pEnumerator->Next(WBEM_INFINITE, 1, &pclsObj, &uReturn) == S_OK)
                {
                    json gpu;
                    VARIANT vtProp;

                    // Name
                    if (SUCCEEDED(pclsObj->Get(L"Name", 0, &vtProp, 0, 0)))
                    {
                        gpu["name"] = BstrToUtf8(vtProp.bstrVal);
                        VariantClear(&vtProp);
                    }

                    // VRAM Calculation (Fix overflow int32)
                    uint64_t vramBytes = 0;
                    if (SUCCEEDED(pclsObj->Get(L"AdapterRAM", 0, &vtProp, 0, 0)))
                    {
                        // Kiểm tra kỹ kiểu dữ liệu trả về từ WMI
                        if (vtProp.vt == VT_UI4) vramBytes = vtProp.ulVal;
                        else if (vtProp.vt == VT_I4) vramBytes = (uint32_t)vtProp.lVal; // Cast về unsigned để tránh số âm
                        else if (vtProp.vt == VT_UI8) vramBytes = vtProp.ullVal;
                        else if (vtProp.vt == VT_I8) vramBytes = (uint64_t)vtProp.llVal;
                        
                        VariantClear(&vtProp);
                    }
                    
                    gpu["vramBytes"] = vramBytes;
                    // Nếu VRAM < 128MB thường là lỗi đọc hoặc iGPU, cứ để hiển thị
                    gpu["vramGB"] = static_cast<double>(vramBytes) / (1024.0 * 1024.0 * 1024.0);

                    // Driver
                    if (SUCCEEDED(pclsObj->Get(L"DriverVersion", 0, &vtProp, 0, 0)))
                    {
                        gpu["driverVersion"] = BstrToUtf8(vtProp.bstrVal);
                        VariantClear(&vtProp);
                    }

                    if (!gpu["name"].get<std::string>().empty()) {
                         result["gpus"].push_back(gpu);
                    }
                   
                    pclsObj->Release();
                }
                pEnumerator->Release();
            }
            cleanupWMI(pLoc, pSvc);
        }

        return result;
    }

    static double getGpuUsage()
    {
        // Lấy Usage chung lớn nhất của các engine GPU
        PDH_HQUERY gpuQuery = nullptr;
        double totalUsage = 0.0;
        
        if (PdhOpenQuery(NULL, 0, &gpuQuery) != ERROR_SUCCESS)
            return 0.0;

        PDH_HCOUNTER gpuCounter = nullptr;
        
        // Wildcard * để lấy tất cả các engine (3D, Video Decode, Copy, etc.)
        PDH_STATUS status = PdhAddEnglishCounterW(gpuQuery, 
            L"\\GPU Engine(*)\\Utilization Percentage", 0, &gpuCounter);
        
        if (status != ERROR_SUCCESS)
        {
            PdhCloseQuery(gpuQuery);
            return 0.0;
        }

        PdhCollectQueryData(gpuQuery);
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        PdhCollectQueryData(gpuQuery);

        DWORD bufferSize = 0;
        DWORD itemCount = 0;
        
        status = PdhGetFormattedCounterArrayW(gpuCounter, PDH_FMT_DOUBLE, 
            &bufferSize, &itemCount, nullptr);
        
        if (status == PDH_MORE_DATA && bufferSize > 0)
        {
            std::vector<BYTE> buffer(bufferSize);
            PDH_FMT_COUNTERVALUE_ITEM_W* items = 
                reinterpret_cast<PDH_FMT_COUNTERVALUE_ITEM_W*>(buffer.data());
            
            status = PdhGetFormattedCounterArrayW(gpuCounter, PDH_FMT_DOUBLE, 
                &bufferSize, &itemCount, items);
            
            if (status == ERROR_SUCCESS)
            {
                // Tìm engine có usage cao nhất (thường là 3D hoặc Compute)
                // Đây là cách đơn giản để đại diện cho "GPU Load"
                double maxUsage = 0.0;
                for (DWORD i = 0; i < itemCount; i++)
                {
                    if (items[i].FmtValue.CStatus == PDH_CSTATUS_VALID_DATA)
                    {
                        double val = items[i].FmtValue.doubleValue;
                        if (val > maxUsage) maxUsage = val;
                    }
                }
                totalUsage = maxUsage;
            }
        }
        
        PdhCloseQuery(gpuQuery);
        
        if (totalUsage < 0) totalUsage = 0;
        if (totalUsage > 100) totalUsage = 100;
        
        return totalUsage;
    }

    static double getGpuTemperature()
    {
        IWbemLocator *pLoc = nullptr;
        IWbemServices *pSvc = nullptr;
        double temp = -1.0;

        if (!initWMI(&pLoc, &pSvc))
            return temp;

        IEnumWbemClassObject *pEnumerator = nullptr;
        BSTR bstrWQL = SysAllocString(L"WQL");
        BSTR bstrQuery = SysAllocString(L"SELECT CurrentReading FROM Win32_TemperatureProbe WHERE Description LIKE '%GPU%'");
        
        HRESULT hres = pSvc->ExecQuery(bstrWQL, bstrQuery,
            WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
            NULL, &pEnumerator);
        
        SysFreeString(bstrWQL);
        SysFreeString(bstrQuery);

        if (SUCCEEDED(hres) && pEnumerator)
        {
            IWbemClassObject *pclsObj = nullptr;
            ULONG uReturn = 0;

            if (pEnumerator->Next(WBEM_INFINITE, 1, &pclsObj, &uReturn) == S_OK)
            {
                VARIANT vtProp;
                if (SUCCEEDED(pclsObj->Get(L"CurrentReading", 0, &vtProp, 0, 0)))
                {
                    temp = static_cast<double>(vtProp.intVal);
                    VariantClear(&vtProp);
                }
                pclsObj->Release();
            }
            pEnumerator->Release();
        }

        cleanupWMI(pLoc, pSvc);
        return temp;
    }

    // ==================== RAM INFO ====================
    static json getRamInfo()
    {
        json result;
        MEMORYSTATUSEX memInfo;
        memInfo.dwLength = sizeof(MEMORYSTATUSEX);

        if (GlobalMemoryStatusEx(&memInfo))
        {
            result["totalBytes"] = memInfo.ullTotalPhys;
            result["availableBytes"] = memInfo.ullAvailPhys;
            result["usedBytes"] = memInfo.ullTotalPhys - memInfo.ullAvailPhys;
            result["usagePercent"] = memInfo.dwMemoryLoad;
            result["totalGB"] = static_cast<double>(memInfo.ullTotalPhys) / (1024.0 * 1024.0 * 1024.0);
            result["usedGB"] = static_cast<double>(memInfo.ullTotalPhys - memInfo.ullAvailPhys) / (1024.0 * 1024.0 * 1024.0);
            result["availableGB"] = static_cast<double>(memInfo.ullAvailPhys) / (1024.0 * 1024.0 * 1024.0);
        }

        return result;
    }

    // ==================== STORAGE INFO ====================
    static json getStorageInfo()
    {
        json result;
        json drives = json::array();

        DWORD drivesMask = GetLogicalDrives();
        char driveLetter[4] = "A:\\";

        for (int i = 0; i < 26; i++)
        {
            if (drivesMask & (1 << i))
            {
                driveLetter[0] = 'A' + i;
                UINT driveType = GetDriveTypeA(driveLetter);

                if (driveType == DRIVE_FIXED)
                {
                    ULARGE_INTEGER freeBytesAvailable, totalBytes, totalFreeBytes;
                    if (GetDiskFreeSpaceExA(driveLetter, &freeBytesAvailable, &totalBytes, &totalFreeBytes))
                    {
                        json drive;
                        drive["drive"] = std::string(1, driveLetter[0]) + ":";
                        drive["totalBytes"] = totalBytes.QuadPart;
                        drive["freeBytes"] = totalFreeBytes.QuadPart;
                        drive["usedBytes"] = totalBytes.QuadPart - totalFreeBytes.QuadPart;
                        drive["totalGB"] = static_cast<double>(totalBytes.QuadPart) / (1024.0 * 1024.0 * 1024.0);
                        drive["freeGB"] = static_cast<double>(totalFreeBytes.QuadPart) / (1024.0 * 1024.0 * 1024.0);
                        drive["usedGB"] = static_cast<double>(totalBytes.QuadPart - totalFreeBytes.QuadPart) / (1024.0 * 1024.0 * 1024.0);
                        drive["usagePercent"] = 100.0 * (1.0 - static_cast<double>(totalFreeBytes.QuadPart) / static_cast<double>(totalBytes.QuadPart));

                        drives.push_back(drive);
                    }
                }
            }
        }

        result["drives"] = drives;
        return result;
    }

    // ==================== NETWORK INFO ====================
    static json getNetworkSpeed()
    {
        json result;
        result["uploadSpeedMbps"] = 0.0;
        result["downloadSpeedMbps"] = 0.0;

        DWORD size = 0;
        GetIfTable(nullptr, &size, FALSE);

        std::vector<BYTE> buffer(size);
        PMIB_IFTABLE ifTable = reinterpret_cast<PMIB_IFTABLE>(buffer.data());

        if (GetIfTable(ifTable, &size, FALSE) == NO_ERROR)
        {
            uint64_t totalBytesRecv = 0;
            uint64_t totalBytesSent = 0;

            for (DWORD i = 0; i < ifTable->dwNumEntries; i++)
            {
                MIB_IFROW &row = ifTable->table[i];
                if (row.dwType == IF_TYPE_ETHERNET_CSMACD || row.dwType == IF_TYPE_IEEE80211)
                {
                    totalBytesRecv += row.dwInOctets;
                    totalBytesSent += row.dwOutOctets;
                }
            }

            auto now = std::chrono::steady_clock::now();

            if (lastBytesRecv > 0 && lastBytesSent > 0)
            {
                auto elapsed = std::chrono::duration<double>(now - lastNetTime).count();
                if (elapsed > 0)
                {
                    lastDownloadSpeed = ((totalBytesRecv - lastBytesRecv) * 8.0) / (elapsed * 1000000.0);
                    lastUploadSpeed = ((totalBytesSent - lastBytesSent) * 8.0) / (elapsed * 1000000.0);

                    if (lastDownloadSpeed < 0) lastDownloadSpeed = 0;
                    if (lastUploadSpeed < 0) lastUploadSpeed = 0;
                }
            }

            lastBytesRecv = totalBytesRecv;
            lastBytesSent = totalBytesSent;
            lastNetTime = now;

            result["uploadSpeedMbps"] = std::round(lastUploadSpeed * 100) / 100;
            result["downloadSpeedMbps"] = std::round(lastDownloadSpeed * 100) / 100;
        }

        return result;
    }

    static json getNetworkAdapters()
    {
        json result;
        json adapters = json::array();

        ULONG bufLen = 15000;
        std::vector<BYTE> buffer(bufLen);
        PIP_ADAPTER_ADDRESSES pAddresses = reinterpret_cast<PIP_ADAPTER_ADDRESSES>(buffer.data());

        if (GetAdaptersAddresses(AF_UNSPEC, GAA_FLAG_INCLUDE_PREFIX, nullptr, pAddresses, &bufLen) == ERROR_SUCCESS)
        {
            for (auto pCurrAddresses = pAddresses; pCurrAddresses; pCurrAddresses = pCurrAddresses->Next)
            {
                if (pCurrAddresses->OperStatus == IfOperStatusUp)
                {
                    json adapter;
                    adapter["name"] = WideToUtf8(pCurrAddresses->FriendlyName);
                    adapter["description"] = WideToUtf8(pCurrAddresses->Description);
                    adapter["type"] = pCurrAddresses->IfType;

                    json ipList = json::array();
                    for (auto pUnicast = pCurrAddresses->FirstUnicastAddress; pUnicast; pUnicast = pUnicast->Next)
                    {
                        char ipStr[INET6_ADDRSTRLEN];
                        DWORD len = INET6_ADDRSTRLEN;
                        if (WSAAddressToStringA(pUnicast->Address.lpSockaddr,
                                                pUnicast->Address.iSockaddrLength, nullptr, ipStr, &len) == 0)
                        {
                            ipList.push_back(std::string(ipStr));
                        }
                    }
                    adapter["ipAddresses"] = ipList;

                    if (pCurrAddresses->PhysicalAddressLength > 0)
                    {
                        char mac[18];
                        snprintf(mac, sizeof(mac), "%02X:%02X:%02X:%02X:%02X:%02X",
                                 pCurrAddresses->PhysicalAddress[0],
                                 pCurrAddresses->PhysicalAddress[1],
                                 pCurrAddresses->PhysicalAddress[2],
                                 pCurrAddresses->PhysicalAddress[3],
                                 pCurrAddresses->PhysicalAddress[4],
                                 pCurrAddresses->PhysicalAddress[5]);
                        adapter["macAddress"] = std::string(mac);
                    }

                    adapters.push_back(adapter);
                }
            }
        }

        result["adapters"] = adapters;
        return result;
    }

    // ==================== TOP PROCESSES ====================
    static json getTopProcesses(int limit = 10)
    {
        json result;
        json processes = json::array();

        HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (snap == INVALID_HANDLE_VALUE)
            return result;

        struct ProcInfo
        {
            DWORD pid;
            std::string name;
            uint64_t memoryBytes;
            double cpuPercent;
        };

        std::vector<ProcInfo> procList;
        PROCESSENTRY32W pe = {sizeof(pe)};

        if (Process32FirstW(snap, &pe))
        {
            do
            {
                ProcInfo info;
                info.pid = pe.th32ProcessID;
                info.name = WideToUtf8(pe.szExeFile);
                info.memoryBytes = 0;
                info.cpuPercent = 0;

                HANDLE hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, FALSE, info.pid);
                if (hProc)
                {
                    PROCESS_MEMORY_COUNTERS pmc;
                    if (GetProcessMemoryInfo(hProc, &pmc, sizeof(pmc)))
                    {
                        info.memoryBytes = pmc.WorkingSetSize;
                    }
                    CloseHandle(hProc);
                }

                if (info.memoryBytes > 0)
                {
                    procList.push_back(info);
                }
            } while (Process32NextW(snap, &pe));
        }
        CloseHandle(snap);

        std::sort(procList.begin(), procList.end(),
                  [](const ProcInfo &a, const ProcInfo &b)
                  { return a.memoryBytes > b.memoryBytes; });

        int count = 0;
        for (const auto &p : procList)
        {
            if (count >= limit) break;

            json proc;
            proc["pid"] = p.pid;
            proc["name"] = p.name;
            proc["memoryBytes"] = p.memoryBytes;
            proc["memoryMB"] = static_cast<double>(p.memoryBytes) / (1024.0 * 1024.0);

            processes.push_back(proc);
            count++;
        }

        result["processes"] = processes;
        return result;
    }

    // ==================== SYSTEM INFO ====================
    static json getSystemInfo()
    {
        json result;

        char computerName[MAX_COMPUTERNAME_LENGTH + 1];
        DWORD size = sizeof(computerName);
        if (GetComputerNameA(computerName, &size))
        {
            result["computerName"] = std::string(computerName);
        }

        char userName[256];
        size = sizeof(userName);
        if (GetUserNameA(userName, &size))
        {
            result["userName"] = std::string(userName);
        }

        IWbemLocator *pLoc = nullptr;
        IWbemServices *pSvc = nullptr;

        if (initWMI(&pLoc, &pSvc))
        {
            IEnumWbemClassObject *pEnumerator = nullptr;
            BSTR bstrWQL = SysAllocString(L"WQL");
            BSTR bstrQuery = SysAllocString(L"SELECT Caption, Version, BuildNumber, OSArchitecture FROM Win32_OperatingSystem");
            
            HRESULT hres = pSvc->ExecQuery(bstrWQL, bstrQuery,
                WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
                NULL, &pEnumerator);
            
            SysFreeString(bstrWQL);
            SysFreeString(bstrQuery);

            if (SUCCEEDED(hres))
            {
                IWbemClassObject *pclsObj = nullptr;
                ULONG uReturn = 0;

                if (pEnumerator->Next(WBEM_INFINITE, 1, &pclsObj, &uReturn) == S_OK)
                {
                    VARIANT vtProp;

                    if (SUCCEEDED(pclsObj->Get(L"Caption", 0, &vtProp, 0, 0)))
                    {
                        result["osName"] = BstrToUtf8(vtProp.bstrVal);
                        VariantClear(&vtProp);
                    }
                    if (SUCCEEDED(pclsObj->Get(L"Version", 0, &vtProp, 0, 0)))
                    {
                        result["osVersion"] = BstrToUtf8(vtProp.bstrVal);
                        VariantClear(&vtProp);
                    }
                    if (SUCCEEDED(pclsObj->Get(L"BuildNumber", 0, &vtProp, 0, 0)))
                    {
                        result["osBuild"] = BstrToUtf8(vtProp.bstrVal);
                        VariantClear(&vtProp);
                    }
                    if (SUCCEEDED(pclsObj->Get(L"OSArchitecture", 0, &vtProp, 0, 0)))
                    {
                        result["osArch"] = BstrToUtf8(vtProp.bstrVal);
                        VariantClear(&vtProp);
                    }
                    pclsObj->Release();
                }
                pEnumerator->Release();
            }
            cleanupWMI(pLoc, pSvc);
        }

        return result;
    }

    // ==================== FULL DEVICE INFO ====================
    static json getAllDeviceInfo()
    {
        json result;

        result["system"] = getSystemInfo();
        result["cpu"] = getCpuInfo();
        result["cpu"]["usagePercent"] = getCpuUsage();
        result["cpu"]["temperatureC"] = getCpuTemperature();
        result["gpu"] = getGpuInfo();
        result["gpu"]["usagePercent"] = getGpuUsage();
        result["gpu"]["temperatureC"] = getGpuTemperature();
        result["ram"] = getRamInfo();
        result["storage"] = getStorageInfo();
        result["network"] = getNetworkSpeed();
        result["networkAdapters"] = getNetworkAdapters();
        result["topProcesses"] = getTopProcesses(10);

        return result;
    }

    static json handleGetDeviceInfo(const json &req)
    {
        std::string type = req.value("type", "all");

        json response;
        response["type"] = "device_info";
        response["success"] = true;

        try
        {
            if (type == "all") response["data"] = getAllDeviceInfo();
            else if (type == "cpu") {
                response["data"] = getCpuInfo();
                response["data"]["usagePercent"] = getCpuUsage();
                response["data"]["temperatureC"] = getCpuTemperature();
            }
            else if (type == "gpu") {
                response["data"] = getGpuInfo();
                response["data"]["usagePercent"] = getGpuUsage();
            }
            else if (type == "ram") response["data"] = getRamInfo();
            else if (type == "storage") response["data"] = getStorageInfo();
            else if (type == "network") {
                json netData;
                netData["speed"] = getNetworkSpeed();
                netData["adapters"] = getNetworkAdapters();
                response["data"] = netData;
            }
            else if (type == "processes") {
                int limit = req.value("limit", 10);
                response["data"] = getTopProcesses(limit);
            }
            else if (type == "system") response["data"] = getSystemInfo();
            else {
                response["success"] = false;
                response["error"] = "Unknown type: " + type;
            }
        }
        catch (const std::exception &e)
        {
            response["success"] = false;
            response["error"] = e.what();
        }

        return response;
    }
};

// Static member initialization
inline PDH_HQUERY DeviceInfo::cpuQuery = nullptr;
inline PDH_HCOUNTER DeviceInfo::cpuCounter = nullptr;
inline bool DeviceInfo::cpuInitialized = false;
inline uint64_t DeviceInfo::lastBytesRecv = 0;
inline uint64_t DeviceInfo::lastBytesSent = 0;
inline std::chrono::steady_clock::time_point DeviceInfo::lastNetTime;
inline double DeviceInfo::lastDownloadSpeed = 0.0;
inline double DeviceInfo::lastUploadSpeed = 0.0;
inline std::mutex DeviceInfo::initMutex;