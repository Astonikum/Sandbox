#include "broadphase.hpp"
#include "geometry.hpp"

void BroadPhase::prepare(const std::vector<Body> &bodies, const std::vector<Link> &links) {
  joined.assign(bodies.size() * bodies.size(), 0);
  for (const auto &link : links)
    if ((link.kind == LinkKind::Hinge || link.kind == LinkKind::Weld) && link.bodyB >= 0) {
      joined[link.bodyA * bodies.size() + link.bodyB] = 1;
      joined[link.bodyB * bodies.size() + link.bodyA] = 1;
    }
  bounds.resize(bodies.size());
}
const std::vector<std::pair<size_t, size_t>> &BroadPhase::update(const std::vector<Body> &bodies) {
  for (size_t i = 0; i < bodies.size(); ++i) {
    const auto &body = bodies[i];
    double ex = projectedRadius(body, {1, 0}) + .0001, ey = projectedRadius(body, {0, 1}) + .0001;
    Vec2 center = contactCenter(body);
    bounds[i] = {i, center.x - ex, center.x + ex, center.y - ey, center.y + ey};
  }
  std::sort(bounds.begin(), bounds.end(), [](const Bounds &a, const Bounds &body) {
    return a.minX == body.minX ? a.index < body.index : a.minX < body.minX;
  });
  pairs.clear();
  for (size_t i = 0; i < bounds.size(); ++i)
    for (size_t impulse = i + 1; impulse < bounds.size() && bounds[impulse].minX <= bounds[i].maxX;
         ++impulse) {
      auto a = bounds[i], body = bounds[impulse];
      if (a.maxY < body.minY || body.maxY < a.minY ||
          joined[a.index * bodies.size() + body.index] ||
          (bodies[a.index].inverseMass() == 0 && bodies[body.index].inverseMass() == 0))
        continue;
      pairs.emplace_back(std::min(a.index, body.index), std::max(a.index, body.index));
    }
  std::sort(pairs.begin(), pairs.end());

  return pairs;
}
