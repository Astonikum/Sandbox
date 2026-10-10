#pragma once
#include "broadphase.hpp"
#include "collision.hpp"
#include "rest.hpp"

class Solver {
  BroadPhase broadPhase;
  BroadPhase correctionPhase;
  std::vector<RestState> correctionStart;
  std::vector<BodySweep> correctionMotion;
  std::vector<std::pair<size_t, size_t>> positionPairs;
  std::vector<size_t> correctedBodies;
  void savePositions(const std::vector<Body> &bodies, std::initializer_list<int> indices);
  bool limitCorrection(std::vector<Body> &bodies, bool pushContacts = false);
  bool correctContact(std::vector<Body> &bodies, size_t first, size_t second);
  bool recoverOverlaps(std::vector<Body> &bodies);
  ContactSolver contacts;
  std::vector<RestState> previous;
  std::vector<RestState> kinematicTarget;
  std::vector<BodySweep> motion;
  bool integrateMotion(std::vector<Body> &bodies, double dt);
  void advanceMotion(std::vector<Body> &bodies, double fraction);

public:
  void reset() { contacts.clear(); }
  bool step(std::vector<Body> &bodies, const std::vector<Link> &links,
            const std::vector<Vec2> &forces, double gravity, double dt, int draggedBody,
            Vec2 target, Vec2 localGrab = {}, const std::vector<RestState> *trajectoryStart = nullptr);
};
