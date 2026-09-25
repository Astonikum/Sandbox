#include "body.hpp"
#include <iterator>

void recordImpulse(Body &body, Vec2 impulse, Vec2 offset, int category, int source, int slot) {
  const double weight = std::hypot(impulse.x, impulse.y);
  if (category && weight > 0 && std::isfinite(weight)) {
    auto sample = std::find_if(
        body.forceSamples.begin(), body.forceSamples.end(), [&](const ForceSample &entry) {
          return entry.source == source && entry.category == category && entry.slot == slot;
        });
    if (sample == body.forceSamples.end()) {
      body.forceSamples.push_back({source, category, slot});
      sample = std::prev(body.forceSamples.end());
    }

    double totalWeight = sample->weight + weight;
    sample->localPoint =
        sample->localPoint * (sample->weight / totalWeight) +
        Vec2{dot(offset, body.axis(0)), dot(offset, body.axis(1))} * (weight / totalWeight);
    sample->weight = totalWeight;
    sample->impulse = sample->impulse + impulse;
  }
  if (category == ForceCategory::Normal)
    body.normalImpulse = body.normalImpulse + impulse;
  if (category == ForceCategory::Friction)
    body.frictionImpulse = body.frictionImpulse + impulse;
  if (category == ForceCategory::Spring)
    body.springImpulse = body.springImpulse + impulse;
  if (category == ForceCategory::Joint)
    body.jointImpulse = body.jointImpulse + impulse;
  if (category == ForceCategory::Rope)
    body.ropeImpulse = body.ropeImpulse + impulse;
}
void applyImpulse(Body &body, Vec2 impulse, Vec2 offset, int category, int source, int slot) {
  body.velocity = body.velocity + impulse * body.inverseMass();
  body.angularVelocity += cross(offset, impulse) * body.inverseInertia();
  body.torqueImpulse += cross(offset, impulse);
  if (category != ForceCategory::None)
    recordImpulse(body, impulse, offset, category, source, slot);
}
Vec2 pointVelocity(const Body &body, Vec2 offset) {
  return (body.fixed && !body.kinematic ? Vec2{} : body.velocity) +
         perpendicular(offset) * body.angularVelocity;
}
