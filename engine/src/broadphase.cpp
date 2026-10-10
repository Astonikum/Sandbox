#include "broadphase.hpp"
#include "geometry.hpp"

void BroadPhase::prepare(const std::vector<Body> &bodies, const std::vector<Link> &links) {
  bool unchanged = assembly.size() == bodies.size() && topology.size() == links.size();
  for (size_t i = 0; unchanged && i < links.size(); ++i)
    unchanged = topology[i] == std::array<int, 3>{links[i].kind, links[i].bodyA, links[i].bodyB};
  if (unchanged)
    return;
  boundsValid = false;
  topology.resize(links.size());
  for (size_t i = 0; i < links.size(); ++i)
    topology[i] = {links[i].kind, links[i].bodyA, links[i].bodyB};
  joined.assign(bodies.size() * bodies.size(), 0);
  for (const auto &link : links)
    if ((link.kind == LinkKind::Hinge || link.kind == LinkKind::Weld) && link.bodyB >= 0) {
      joined[link.bodyA * bodies.size() + link.bodyB] = 1;
      joined[link.bodyB * bodies.size() + link.bodyA] = 1;
    }
  assembly.resize(bodies.size());
  for (size_t i = 0; i < assembly.size(); ++i) assembly[i] = i;
  for (const auto &link : links) if (link.kind == LinkKind::Weld && link.bodyB >= 0) {
    const auto from = assembly[link.bodyB], to = assembly[link.bodyA];
    for (auto &id : assembly) if (id == from) id = to;
  }
  for (size_t a = 0; a < bodies.size(); ++a)
    for (size_t b = 0; b < bodies.size(); ++b)
      if (assembly[a] == assembly[b]) joined[a * bodies.size() + b] = 1;
}
const std::vector<std::pair<size_t, size_t>> &BroadPhase::update(const std::vector<Body> &bodies) {
  bool unchanged = boundsValid && shapes.size() == bodies.size();
  for (size_t i = 0; unchanged && i < bodies.size(); ++i) {
    const auto &body = bodies[i];
    const auto &shape = shapes[i];
    unchanged = shape.position.x == body.position.x && shape.position.y == body.position.y &&
                shape.angle == body.angle && shape.width == body.width && shape.height == body.height &&
                shape.kind == body.kind && shape.immovable == (body.inverseMass() == 0);
  }
  if (unchanged)
    return pairs;
  shapes.resize(bodies.size());
  for (size_t i = 0; i < bodies.size(); ++i) {
    const auto &body = bodies[i];
    shapes[i] = {body.position, body.angle, body.width, body.height, body.kind, body.inverseMass() == 0};
  }
  boundsValid = true;
  bounds.clear();
  bounds.reserve(bodies.size());
  for (size_t i = 0; i < bodies.size(); ++i) {
    const auto &body = bodies[i];
    if (body.kind == BodyKind::Rod)
      continue;
    double ex = projectedRadius(body, {1, 0}) + .0001, ey = projectedRadius(body, {0, 1}) + .0001;
    Vec2 center = contactCenter(body);
    bounds.push_back({i, center.x - ex, center.x + ex, center.y - ey, center.y + ey});
  }
  collectPairs(bodies);
  return pairs;
}
const std::vector<std::pair<size_t, size_t>> &BroadPhase::sweep(
    const std::vector<Body> &bodies, const std::vector<BodySweep> &motion) {
  boundsValid = false;
  bounds.clear();
  bounds.reserve(bodies.size());
  for (size_t i = 0; i < bodies.size(); ++i) {
    const auto &body = bodies[i];
    if (body.kind == BodyKind::Rod)
      continue;
    double ex = projectedRadius(body, {1, 0}), ey = projectedRadius(body, {0, 1});
    if (!body.round() && motion[i].rotation != 0) {
      const double radius = std::hypot(body.width, contactHeight(body)) / 2;
      const double reach = std::abs(motion[i].rotation) * radius;
      ex = std::min(radius, ex + reach);
      ey = std::min(radius, ey + reach);
    }
    ex += .0001;
    ey += .0001;
    const Vec2 end = body.position + motion[i].translation;
    bounds.push_back({i, std::min(body.position.x, end.x) - ex, std::max(body.position.x, end.x) + ex,
                        std::min(body.position.y, end.y) - ey, std::max(body.position.y, end.y) + ey});
  }
  collectPairs(bodies);
  return pairs;
}
void BroadPhase::collectPairs(const std::vector<Body> &bodies) {
  double minX = std::numeric_limits<double>::infinity(), minY = minX;
  double maxX = -minX, maxY = -minX, totalWidth = 0, totalHeight = 0;
  for (const auto &bound : bounds) {
    minX = std::min(minX, bound.minX);
    maxX = std::max(maxX, bound.maxX);
    minY = std::min(minY, bound.minY);
    maxY = std::max(maxY, bound.maxY);
    totalWidth += bound.maxX - bound.minX;
    totalHeight += bound.maxY - bound.minY;
  }
  if (bounds.size() > 1 && (maxY - minY) * totalWidth > (maxX - minX) * totalHeight)
    for (auto &bound : bounds) {
      std::swap(bound.minX, bound.minY);
      std::swap(bound.maxX, bound.maxY);
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

}
