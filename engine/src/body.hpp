#pragma once
#include "math.hpp"
#include <limits>
#include <vector>

namespace BodyKind {
constexpr int Rectangle = 0, Circle = 1, Pulley = 5, Surface = 9, Rod = 10;
}
namespace LinkKind {
constexpr int Hinge = 2, Spring = 3, Rope = 4, Pulley = 10, Weld = 12;
}
namespace ForceCategory {
constexpr int None = 0, Normal = 1, Friction = 2, Spring = 3, Joint = 4, Rope = 5;
}

struct ForceSample {
  int source, category, slot;
  Vec2 impulse{}, localPoint{};
  double weight = 0;
};

struct Body {
  int kind;
  Vec2 position, velocity;
  double width, height, angle, mass, friction, restitution, angularVelocity;
  bool fixed;
  bool kinematic = false;
  bool touching = false;
  double quietTime = 0;
  Vec2 normalImpulse{}, frictionImpulse{}, springImpulse{}, jointImpulse{}, ropeImpulse{},
      externalImpulse{};
  double torqueImpulse = 0;
  std::vector<ForceSample> forceSamples;
  mutable double cachedAngle = std::numeric_limits<double>::quiet_NaN();
  mutable Vec2 cachedX{}, cachedY{};
  bool round() const { return kind == BodyKind::Circle || kind == BodyKind::Pulley; }
  Vec2 axis(int i) const {
    if (angle != cachedAngle) {
      cachedAngle = angle;
      cachedX = {std::cos(angle), std::sin(angle)};
      cachedY = {-cachedX.y, cachedX.x};
    }
    return i ? cachedY : cachedX;
  }
  double inverseMass() const { return fixed || kinematic ? 0 : 1 / mass; }
  double inverseInertia() const {
    return kinematic || (fixed && kind != BodyKind::Pulley) || mass <= 0
               ? 0
               : 1 / (mass *
                      (round() ? width * width / 8 : (width * width + height * height) / 12));
  }
};
struct Link {
  int kind, bodyA, bodyB;
  Vec2 anchor, localAnchorA, localAnchorB;
  double length, stiffness, damping;
  int pulley = -1;
  double referenceAngle = 0;
  mutable double material = 0;
  mutable bool initialized = false;
};
void recordImpulse(Body &body, Vec2 impulse, Vec2 offset, int category, int source, int slot = 0);
void applyImpulse(Body &body, Vec2 impulse, Vec2 offset, int category = 0, int source = 0,
                  int slot = 0);
Vec2 pointVelocity(const Body &body, Vec2 offset);
