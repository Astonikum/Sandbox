#include "geometry.hpp"

Vec2 contactCenter(const Body &body) {
  return body.kind == BodyKind::Surface ? body.position - body.axis(1) * (body.height / 2)
                                        : body.position;
}
double contactHeight(const Body &body) { return body.kind == BodyKind::Surface ? 0 : body.height; }
double projectedRadius(const Body &body, Vec2 axis) {
  if (body.round())
    return body.width / 2;
  return std::abs(dot(body.axis(0), axis)) * body.width / 2 +
         std::abs(dot(body.axis(1), axis)) * contactHeight(body) / 2;
}
std::pair<double, double> supportInterval(const Body &body, Vec2 normal, Vec2 tangentAxis) {
  if (body.round()) {
    double projection = dot(body.position, tangentAxis);
    return {projection, projection};
  }
  Vec2 localNormal = {dot(normal, body.axis(0)), dot(normal, body.axis(1))};
  double lower = 1e30, upper = -1e30;
  for (int sign : {-1, 1}) {
    Vec2 projection =
        std::abs(localNormal.x) > std::abs(localNormal.y)
            ? Vec2{std::copysign(body.width / 2, localNormal.x), sign * contactHeight(body) / 2}
            : Vec2{sign * body.width / 2, std::copysign(contactHeight(body) / 2, localNormal.y)};
    double value =
        dot(contactCenter(body) + body.axis(0) * projection.x + body.axis(1) * projection.y,
            tangentAxis);
    lower = std::min(lower, value);
    upper = std::max(upper, value);
  }
  return {lower, upper};
}
double supportHeight(const Body &body, Vec2 normal, Vec2 tangentAxis, double tangent) {
  if (body.round())
    return dot(body.position, normal) + body.width / 2;
  Vec2 localNormal = {dot(normal, body.axis(0)), dot(normal, body.axis(1))},
       axis = std::abs(localNormal.x) > std::abs(localNormal.y)
                  ? body.axis(0) * std::copysign(1., localNormal.x)
                  : body.axis(1) * std::copysign(1., localNormal.y);
  double halfExtent =
      std::abs(localNormal.x) > std::abs(localNormal.y) ? body.width / 2 : contactHeight(body) / 2;
  return (halfExtent + dot(contactCenter(body), axis) - tangent * dot(tangentAxis, axis)) /
         dot(normal, axis);
}
