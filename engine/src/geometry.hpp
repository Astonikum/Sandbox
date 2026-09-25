#pragma once
#include "body.hpp"
#include <utility>

Vec2 contactCenter(const Body &body);
double contactHeight(const Body &body);
double projectedRadius(const Body &body, Vec2 axis);
std::pair<double, double> supportInterval(const Body &body, Vec2 normal, Vec2 tangent);
double supportHeight(const Body &body, Vec2 normal, Vec2 tangent, double projection);
