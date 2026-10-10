#pragma once
#include "body.hpp"
#include <map>

struct ContactGeometry {
  Vec2 axes[4]{};
  double radii[4]{};
  double angleA = std::numeric_limits<double>::quiet_NaN();
  double angleB = std::numeric_limits<double>::quiet_NaN();
};

struct ContactState {
  ContactState() = default;

  Vec2 normal{}, points[2]{}, offsetA[2]{}, offsetB[2]{};
  Vec2 frictionOffsetA{}, frictionOffsetB{};
  double bounceVelocity[2]{}, normalImpulse[2]{};
  double tangentImpulse = 0, rollingImpulse = 0, dt = 0;
  double normalMass[2][2]{}, coupling[2]{}, tangentMass = 0, friction = 0;
  int count = 0;
  bool active = false;
  size_t bodyA = 0, bodyB = 0;
  ContactGeometry geometry;
  Vec2 solvedVelocityA{}, solvedVelocityB{};
  double solvedAngularA = 0, solvedAngularB = 0;
  bool converged = false;
};

class ContactSolver {
  std::map<int, ContactState, std::greater<int>> contacts;
  std::vector<ContactState *> lookup;
  double dt = 0;
  ContactState &getContact(size_t first, size_t second, int source, size_t bodyCount);

public:
  void clear();
  void beginStep(double duration);
  void warmStart(std::vector<Body> &bodies);
  bool prepare(std::vector<Body> &bodies, size_t first, size_t second, int source);
  void release(std::vector<Body> &bodies, int source);
  void solve(std::vector<Body> &bodies, size_t first, size_t second, int source);
  void finishStep(std::vector<Body> &bodies);
};

void solveContact(Body &a, Body &b, int source = 0);
