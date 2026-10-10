#include "solver.hpp"
#include "collision.hpp"
#include "constraints.hpp"

namespace {
void integrateForces(std::vector<Body> &bodies, const std::vector<Vec2> &forces, double gravity,
                     double dt, int draggedBody, Vec2 target, Vec2 localGrab) {
  for (size_t i = 0; i < bodies.size(); ++i) {
    auto &body = bodies[i];
    if (body.fixed || body.kinematic)
      continue;
    Vec2 force = forces[i] + Vec2{0, gravity * body.mass};
    if ((int)i == draggedBody) {
      Vec2 offset = body.rotate(localGrab);
      Vec2 pull = (target - body.position - offset) * (body.mass * 150) -
                  pointVelocity(body, offset) * (body.mass * 20);
      double limit = body.mass * 50;
      if (length(pull) > limit)
        pull = normalized(pull) * limit;
      force = force + pull;
      body.angularVelocity += cross(offset, pull * dt) * body.inverseInertia();
      body.torqueImpulse += cross(offset, pull * dt);
    }
    body.velocity = body.velocity + force * (dt / body.mass);
    body.externalImpulse = body.externalImpulse + force * dt;
  }
}
void applySprings(std::vector<Body> &bodies, const std::vector<Link> &links, double dt) {
  for (auto &link : links)
    if (link.kind == LinkKind::Spring && link.bodyA >= 0) {
      const int source = static_cast<int>(&link - links.data());
      auto &a = bodies[link.bodyA];
      Body *body = link.bodyB >= 0 ? &bodies[link.bodyB] : nullptr;
      Vec2 offsetA = a.rotate(link.localAnchorA),
           offsetB = body ? body->rotate(link.localAnchorB) : Vec2{};
      Vec2 impulse = springImpulse(a, body, link, offsetA, offsetB, dt);
      applyImpulse(a, impulse, offsetA, ForceCategory::Spring, source);
      if (body)
        applyImpulse(*body, impulse * (-1), offsetB, ForceCategory::Spring, source);
    }
}
}
void Solver::savePositions(const std::vector<Body> &bodies, std::initializer_list<int> indices) {
  correctionStart.resize(bodies.size());
  correctionMotion.assign(bodies.size(), {});
  correctedBodies.clear();
  for (int index : indices)
    if (index >= 0 && static_cast<size_t>(index) < bodies.size() &&
        std::find(correctedBodies.begin(), correctedBodies.end(), static_cast<size_t>(index)) == correctedBodies.end()) {
      correctedBodies.push_back(index);
      correctionStart[index] = {bodies[index].position, {}, bodies[index].angle, 0};
    }
}
bool Solver::limitCorrection(std::vector<Body> &bodies, bool pushContacts) {
  bool changed = false;
  for (size_t i : correctedBodies) {
    auto &body = bodies[i];
    correctionMotion[i] = {body.position - correctionStart[i].position, body.angle - correctionStart[i].angle};
    const auto &move = correctionMotion[i];
    if (!changed && (move.translation.x != 0 || move.translation.y != 0 || move.rotation != 0)) {
      const double rotationTravel = move.rotation == 0 ? 0 :
                                      std::abs(move.rotation) * std::hypot(body.width, body.height) / 2;
      changed = length(move.translation) + rotationTravel > 1e-12;
    }
    body.position = correctionStart[i].position;
    body.angle = correctionStart[i].angle;
  }
  if (!changed)
    return true;
  for (int iteration = 0; iteration < 64; ++iteration) {
    ImpactTime earliest;
    size_t firstHit = 0, secondHit = 0;
    for (auto [first, second] : correctionPhase.sweep(bodies, correctionMotion)) {
      const auto &a = correctionMotion[first], &b = correctionMotion[second];
      if (dot(a.translation, a.translation) == 0 && a.rotation == 0 &&
          dot(b.translation, b.translation) == 0 && b.rotation == 0)
        continue;
      const auto impact = timeOfImpact(bodies[first], a, bodies[second], b, true);
      if (!impact.converged)
        return false;
      if (impact.hit && (!earliest.hit || impact.fraction < earliest.fraction)) {
        earliest = impact;
        firstHit = first;
        secondHit = second;
      }
    }
    if (!earliest.hit) {
      for (size_t i = 0; i < bodies.size(); ++i) {
        bodies[i].position = bodies[i].position + correctionMotion[i].translation;
        bodies[i].angle += correctionMotion[i].rotation;
      }
      return true;
    }
    if (pushContacts && correctionMotion[firstHit].rotation == 0 && correctionMotion[secondHit].rotation == 0) {
      auto &a = bodies[firstHit], &b = bodies[secondHit];
      const Vec2 startA = a.position, startB = b.position;
      a.position = startA + correctionMotion[firstHit].translation * earliest.fraction;
      b.position = startB + correctionMotion[secondHit].translation * earliest.fraction;
      Vec2 normal;
      separatingDistance(a, b, normal);
      a.position = startA;
      b.position = startB;
      const double closing = -dot(correctionMotion[secondHit].translation -
                                  correctionMotion[firstHit].translation, normal) * (1 - earliest.fraction);
      const double inverseMass = a.inverseMass() + b.inverseMass();
      if (closing > 0 && inverseMass > 0) {
        const Vec2 correction = normal * ((closing + 2 * CcdDistance) / inverseMass);
        correctionMotion[firstHit].translation = correctionMotion[firstHit].translation - correction * a.inverseMass();
        correctionMotion[secondHit].translation = correctionMotion[secondHit].translation + correction * b.inverseMass();
        continue;
      }
    }
    double travel = 0;
    for (size_t i : {firstHit, secondHit})
      travel += length(correctionMotion[i].translation) +
                std::abs(correctionMotion[i].rotation) * std::hypot(bodies[i].width, bodies[i].height) / 2;
    const double fraction = std::max(0., earliest.fraction - 2 * CcdDistance / std::max(travel, CcdDistance));
    for (size_t i : {firstHit, secondHit}) {
      correctionMotion[i].translation = correctionMotion[i].translation * fraction;
      correctionMotion[i].rotation *= fraction;
    }
  }
  return false;
}

bool Solver::correctContact(std::vector<Body> &bodies, size_t first, size_t second) {
  auto &a = bodies[first], &b = bodies[second];
  Vec2 normal;
  const double depth = -separatingDistance(a, b, normal);
  if (depth <= PositionTolerance)
    return true;
  const double inverseMass = a.inverseMass() + b.inverseMass();
  if (inverseMass == 0)
    return true;
  savePositions(bodies, {static_cast<int>(first), static_cast<int>(second)});
  const Vec2 correction = normal * ((depth - PositionTolerance) * .6 / inverseMass);
  a.position = a.position - correction * a.inverseMass();
  b.position = b.position + correction * b.inverseMass();
  return limitCorrection(bodies, true);
}
bool Solver::recoverOverlaps(std::vector<Body> &bodies) {
  for (int iteration = 0; iteration < 96; ++iteration) {
    positionPairs = broadPhase.update(bodies);
    double depth = 0;
    for (auto [first, second] : positionPairs) {
      Vec2 normal;
      depth = std::max(depth, -separatingDistance(bodies[first], bodies[second], normal));
      if (!correctContact(bodies, first, second))
        return false;
    }
    if (depth <= PositionTolerance * 2)
      return true;
  }
  return false;
}
void Solver::advanceMotion(std::vector<Body> &bodies, double fraction) {
  for (size_t i = 0; i < bodies.size(); ++i) {
    auto &body = bodies[i];
    body.position = body.position + motion[i].translation * fraction;
    body.angle += motion[i].rotation * fraction;
    if (body.kinematic && !kinematicTarget.empty() && fraction == 1) {
      body.position = kinematicTarget[i].position;
      body.angle = kinematicTarget[i].angle;
    }
  }
}
bool Solver::integrateMotion(std::vector<Body> &bodies, double dt) {
  double remaining = dt;
  motion.resize(bodies.size());
  for (int event = 0; event < 64; ++event) {
    bool moving = false;
    for (size_t i = 0; i < bodies.size(); ++i) {
      const auto &body = bodies[i];
      motion[i] = {body.fixed || body.kinematic ? Vec2{} : body.velocity * remaining,
                   body.inverseInertia() > 0 ? body.angularVelocity * remaining : 0};
      if (body.kinematic && !kinematicTarget.empty())
        motion[i] = {kinematicTarget[i].position - body.position, kinematicTarget[i].angle - body.angle};
      if (body.kind != BodyKind::Rod)
        moving = moving || length(motion[i].translation) +
                              (body.round() ? 0 : std::abs(motion[i].rotation) *
                                                    std::hypot(body.width, body.height) / 2) > CcdDistance;
    }
    ImpactTime earliest;
    size_t firstHit = 0, secondHit = 0;
    if (moving)
      for (auto [first, second] : broadPhase.sweep(bodies, motion)) {
        const auto impact = timeOfImpact(bodies[first], motion[first], bodies[second], motion[second]);
        if (!impact.converged)
          return false;
        if (impact.hit && (!earliest.hit || impact.fraction < earliest.fraction)) {
          earliest = impact;
          firstHit = first;
          secondHit = second;
        }
      }
    if (!earliest.hit) {
      advanceMotion(bodies, 1);
      return true;
    }
    const int impactSource = -1 - static_cast<int>(firstHit * bodies.size() + secondHit);
    if (earliest.fraction > 0)
      contacts.release(bodies, impactSource);
    advanceMotion(bodies, earliest.fraction);
    remaining *= 1 - earliest.fraction;
    if (!contacts.prepare(bodies, firstHit, secondHit, impactSource))
      return false;
    for (auto [first, second] : broadPhase.update(bodies)) {
      const int source = -1 - static_cast<int>(first * bodies.size() + second);
      if (source != impactSource)
        contacts.prepare(bodies, first, second, source);
    }
    for (int iteration = 0; iteration < 96; ++iteration)
      for (auto [first, second] : broadPhase.candidates()) {
        const int source = -1 - static_cast<int>(first * bodies.size() + second);
        contacts.solve(bodies, first, second, source);
      }
    if (remaining <= 0)
      return true;
  }
  return false;
}
bool Solver::step(std::vector<Body> &bodies, const std::vector<Link> &links,
                  const std::vector<Vec2> &forces, double gravity, double dt, int draggedBody,
                  Vec2 target, Vec2 localGrab, const std::vector<RestState> *trajectoryStart) {
  kinematicTarget.clear();
  if (trajectoryStart) {
    kinematicTarget.resize(bodies.size());
    for (size_t i = 0; i < bodies.size(); ++i) {
      auto &body = bodies[i];
      if (!body.kinematic)
        continue;
      kinematicTarget[i] = {body.position, body.velocity, body.angle, body.angularVelocity};
      body.position = (*trajectoryStart)[i].position;
      body.angle = (*trajectoryStart)[i].angle;
      body.velocity = (kinematicTarget[i].position - body.position) * (1 / dt);
      body.angularVelocity = (kinematicTarget[i].angle - body.angle) / dt;
    }
  }
  previous.clear();
  previous.reserve(bodies.size());
  for (auto &body : bodies) {
    previous.push_back({body.position, body.velocity, body.angle, body.angularVelocity});
    body.touching = false;
  }
  integrateForces(bodies, forces, gravity, dt, draggedBody, target, localGrab);
  applySprings(bodies, links, dt);
  broadPhase.prepare(bodies, links);
  correctionPhase.prepare(bodies, links);
  if (!recoverOverlaps(bodies))
    return false;
  contacts.beginStep(dt);
  contacts.warmStart(bodies);
  broadPhase.prepare(bodies, links);
  for (auto [first, second] : broadPhase.update(bodies)) {
    const int source = -1 - static_cast<int>(first * bodies.size() + second);
    contacts.prepare(bodies, first, second, source);
    contacts.solve(bodies, first, second, source);
  }
  if (!integrateMotion(bodies, dt))
    return false;
  for (auto [first, second] : broadPhase.update(bodies)) {
    const int source = -1 - static_cast<int>(first * bodies.size() + second);
    contacts.prepare(bodies, first, second, source);
  }
  const int iterations = std::min(96, 24 + static_cast<int>(links.size()) * 4);
  const bool hasConstraints = std::any_of(links.begin(), links.end(), [](const Link &link) {
    return link.kind != LinkKind::Spring;
  });
  constexpr int broadPhaseInterval = 4;
  for (int iteration = 0; iteration < iterations; ++iteration) {
    if (!hasConstraints && broadPhase.candidates().empty())
      break;
    for (size_t i = 0; i < links.size(); ++i)
      if (links[i].kind != LinkKind::Spring) {
        savePositions(bodies, {links[i].bodyA, links[i].bodyB, links[i].pulley});
        solveConstraint(bodies, links[i], static_cast<int>(i));
        if (!limitCorrection(bodies))
          return false;
      }
    if (iteration % broadPhaseInterval == 0)
      broadPhase.update(bodies);
    for (auto [first, second] : broadPhase.candidates()) {
      const int source = -1 - static_cast<int>(first * bodies.size() + second);
      if (!correctContact(bodies, first, second))
        return false;
      contacts.solve(bodies, first, second, source);
    }
  }
  contacts.finishStep(bodies);
  for (size_t i = 0; i < bodies.size(); ++i) {
    if (bodies[i].kinematic && !kinematicTarget.empty()) {
      bodies[i].velocity = kinematicTarget[i].velocity;
      bodies[i].angularVelocity = kinematicTarget[i].angularVelocity;
    }
    stabilizeRest(bodies[i], previous[i], dt, static_cast<int>(i) == draggedBody);
  }
  return true;
}
