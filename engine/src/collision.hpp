#pragma once
#include "body.hpp"
#include <map>

struct ContactState {
  Vec2 normal{}, points[2]{}, offsetA[2]{}, offsetB[2]{};
  Vec2 frictionOffsetA{}, frictionOffsetB{};
  double bounceVelocity[2]{}, normalImpulse[2]{};
  double tangentImpulse = 0, rollingImpulse = 0, dt = 0;
  int count = 0;
  bool active = false;
  size_t bodyA = 0, bodyB = 0;
};

class ContactSolver {
  std::map<int, ContactState, std::greater<int>> contacts;
  double dt = 0;

public:
  void clear() { contacts.clear(); }
  void beginStep(double duration);
  void warmStart(std::vector<Body> &bodies);
  void prepare(std::vector<Body> &bodies, size_t first, size_t second, int source);
  void solve(std::vector<Body> &bodies, size_t first, size_t second, int source);
  void finishStep(std::vector<Body> &bodies);
};

void solveContact(Body &a, Body &b, int source = 0);
