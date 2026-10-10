#include "ccd.hpp"
#include "geometry.hpp"
#include <array>

namespace {
Body shapeAt(const Body &body, const BodySweep &sweep, double fraction) {
  return {body.kind, body.position + sweep.translation * fraction, {}, body.width, body.height,
          body.angle + sweep.rotation * fraction, 1, 0, 0, 0, false};
}
}
double separatingDistance(const Body &a, const Body &b, Vec2 &normal) {
  const Vec2 separation = b.position - a.position;
  if (a.round() && b.round()) {
    const double distance = length(separation);
    normal = distance > 0 ? separation * (1 / distance) : Vec2{0, 1};
    return distance - a.width / 2 - b.width / 2;
  }
  std::array<Vec2, 5> axes{a.axis(0), a.axis(1), b.axis(0), b.axis(1)};
  int count = 4;
  if (a.round() || b.round()) {
    const Body &box = a.round() ? b : a;
    const Body &circle = a.round() ? a : b;
    const Vec2 local = rotated(circle.position - box.position, -box.angle);
    const Vec2 closest{std::clamp(local.x, -box.width / 2, box.width / 2),
                       std::clamp(local.y, -contactHeight(box) / 2, contactHeight(box) / 2)};
    const Vec2 corner = circle.position - box.position - box.rotate(closest);
    if (length(corner) > 1e-12)
      axes[count++] = corner * (1 / length(corner));
  }
  double distance = -std::numeric_limits<double>::infinity();
  for (int i = 0; i < count; ++i) {
    const double projection = dot(separation, axes[i]);
    const double gap = std::abs(projection) - projectedRadius(a, axes[i]) - projectedRadius(b, axes[i]);
    if (gap > distance) {
      distance = gap;
      normal = axes[i] * (projection < 0 ? -1 : 1);
    }
  }
  return distance;
}
namespace {
struct RadiusRate {
  double growth, duration;
};
RadiusRate radiusRate(const Body &body, Vec2 normal, double rotation, double remaining) {
  if (body.round() || rotation == 0)
    return {0, remaining};
  const double halfWidth = body.width / 2, halfHeight = contactHeight(body) / 2;
  constexpr double halfPi = 1.5707963267948966;
  const Vec2 local{dot(normal, body.axis(0)), dot(normal, body.axis(1))};
  const Vec2 vertex = body.rotate({std::copysign(halfWidth, local.x), std::copysign(halfHeight, local.y)});
  double growth = rotation * cross(vertex, normal);
  if (std::abs(local.x) <= 1e-14)
    growth = std::abs(rotation) * halfWidth;
  if (std::abs(local.y) <= 1e-14)
    growth = std::abs(rotation) * halfHeight;
  const double phase = std::atan2(-local.y, local.x);
  const double quadrant = rotation > 0 ? std::floor(phase / halfPi + 1e-14) + 1
                                       : std::ceil(phase / halfPi - 1e-14) - 1;
  return {growth, std::min(remaining, (quadrant * halfPi - phase) / rotation)};
}
double maximumRadius(const Body &body, Vec2 normal, double rotation, double first, double last) {
  if (body.round())
    return body.width / 2;
  const double x = body.width / 2, y = contactHeight(body) / 2;
  constexpr double pi = 3.141592653589793;
  const double phase = std::atan2(-dot(normal, body.axis(1)), dot(normal, body.axis(0)));
  const double start = phase + rotation * first, end = phase + rotation * last;
  const double lower = std::min(start, end), upper = std::max(start, end);
  if (upper - lower >= pi)
    return std::hypot(x, y);
  const double peak = std::atan2(y, x);
  for (double offset : {peak, -peak})
    if (std::ceil((lower - offset) / pi) * pi + offset <= upper)
      return std::hypot(x, y);
  return std::max(x * std::abs(std::cos(start)) + y * std::abs(std::sin(start)),
                  x * std::abs(std::cos(end)) + y * std::abs(std::sin(end)));
}
ImpactTime searchIntervals(const Body &a, const BodySweep &sweepA,
                           const Body &b, const BodySweep &sweepB, double first, double target) {
  struct Interval { double first, last; };
  std::array<Interval, 64> pending{};
  pending[0] = {first, 1};
  size_t count = 1;
  const Vec2 relative = sweepB.translation - sweepA.translation;
  const double speed = length(relative) +
                       (a.round() ? 0 : std::abs(sweepA.rotation) * std::hypot(a.width, contactHeight(a)) / 2) +
                       (b.round() ? 0 : std::abs(sweepB.rotation) * std::hypot(b.width, contactHeight(b)) / 2);
  for (int iteration = 0; count && iteration < 4096; ++iteration) {
    const auto interval = pending[--count];
    const double middle = (interval.first + interval.last) / 2, width = interval.last - interval.first;
    const Body poseA = shapeAt(a, sweepA, middle), poseB = shapeAt(b, sweepB, middle);
    Vec2 normal;
    const double distance = separatingDistance(poseA, poseB, normal);
    double bound = dot(poseB.position - poseA.position, normal) -
                         std::abs(dot(relative, normal)) * width / 2 -
                         maximumRadius(a, normal, sweepA.rotation, interval.first, interval.last) -
                         maximumRadius(b, normal, sweepB.rotation, interval.first, interval.last);
    const double halfWidth = width / 2;
    const double axisRotation = a.round() ? sweepB.rotation : sweepA.rotation;
    const Vec2 separation = poseB.position - poseA.position;
    const double projectionRate = dot(relative, normal) + axisRotation * cross(normal, separation);
    const double maxSeparation = std::max(length(separation - relative * halfWidth),
                                         length(separation + relative * halfWidth));
    const double curvature = 2 * std::abs(axisRotation) * length(relative) +
                             axisRotation * axisRotation * maxSeparation;
    const double rotatingBound = dot(separation, normal) - std::abs(projectionRate) * halfWidth -
                                 .5 * curvature * halfWidth * halfWidth -
                                 maximumRadius(poseA, normal, sweepA.rotation - axisRotation, -halfWidth, halfWidth) -
                                 maximumRadius(poseB, normal, sweepB.rotation - axisRotation, -halfWidth, halfWidth);
    bound = std::max(bound, rotatingBound);
    const auto forwardA = radiusRate(poseA, normal, sweepA.rotation - axisRotation, halfWidth),
               forwardB = radiusRate(poseB, normal, sweepB.rotation - axisRotation, halfWidth),
               backwardA = radiusRate(poseA, normal, axisRotation - sweepA.rotation, halfWidth),
               backwardB = radiusRate(poseB, normal, axisRotation - sweepB.rotation, halfWidth);
    if (forwardA.duration >= halfWidth && forwardB.duration >= halfWidth &&
        backwardA.duration >= halfWidth && backwardB.duration >= halfWidth) {
      const double closing = std::max(-projectionRate + forwardA.growth + forwardB.growth,
                                      projectionRate + backwardA.growth + backwardB.growth);
      bound = std::max(bound, distance - std::max(0., closing) * halfWidth -
                              .5 * curvature * halfWidth * halfWidth);
    }
    if (bound > target - CcdDistance)
      continue;
    if (width * speed <= 1e-9 || middle == interval.first || middle == interval.last) {
      if (distance <= target)
        return {middle, true, true};
      const Body endA = shapeAt(a, sweepA, interval.last), endB = shapeAt(b, sweepB, interval.last);
      if (separatingDistance(endA, endB, normal) <= target)
        return {interval.last, true, true};
      return {interval.first, false, false};
    }
    if (count + 2 > pending.size())
      return {interval.first, false, false};
    pending[count++] = {middle, interval.last};
    pending[count++] = {interval.first, middle};
  }
  return count ? ImpactTime{first, false, false} : ImpactTime{};
}

}

ImpactTime timeOfImpact(const Body &a, const BodySweep &sweepA,
                        const Body &b, const BodySweep &sweepB, bool limitOverlap) {
  Vec2 initialNormal;
  const double initialDistance = limitOverlap ? separatingDistance(a, b, initialNormal) : 0;
  const double target = limitOverlap && initialDistance <= 0
                            ? std::min(-PositionTolerance, initialDistance - CcdDistance) : 0;
  const Vec2 relative = sweepB.translation - sweepA.translation;
  double fraction = 0;
  for (int iteration = 0; iteration < 128; ++iteration) {
    const Body poseA = shapeAt(a, sweepA, fraction), poseB = shapeAt(b, sweepB, fraction);
    Vec2 normal;
    const double distance = separatingDistance(poseA, poseB, normal);
    if (distance <= target)
      return {fraction, limitOverlap || fraction > 0, true};
    const auto rateA = radiusRate(poseA, normal, sweepA.rotation, 1 - fraction),
               rateB = radiusRate(poseB, normal, sweepB.rotation, 1 - fraction);
    const double closing = -dot(relative, normal) + rateA.growth + rateB.growth;
    const double interval = std::min(rateA.duration, rateB.duration);
    double increment = closing > 0 ? (distance - target + CcdDistance) / closing
                                   : std::numeric_limits<double>::infinity();
    if (increment > interval) {
      if (interval >= 1 - fraction)
        return {};
      increment = interval;
    }
    if (increment <= 0 || fraction + increment == fraction)
      return searchIntervals(a, sweepA, b, sweepB, fraction, target);
    fraction += increment;
  }
  return searchIntervals(a, sweepA, b, sweepB, fraction, target);
}
