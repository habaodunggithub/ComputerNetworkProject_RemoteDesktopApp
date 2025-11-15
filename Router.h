#pragma once
#include <unordered_map>
#include <functional>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

class Router {
public:
    using Handler = std::function<json(const json&)>;

    static void registerAllHandlers(std::unordered_map<std::string, Handler>& map);
    static json dispatch(const std::unordered_map<std::string, Handler>& map, const json& req);
};
