#pragma once
#include "expression.hpp"
#include "history.hpp"
#include "solver.hpp"

class Runtime {
  struct Swept {
    int i;
    double x0, x1, y0, y1, speed;
  };
  std::array<double,
             protocol::MaxBodies * protocol::BodyStride + protocol::MaxLinks * protocol::LinkStride>
      input{};
  std::array<double, protocol::MaxBodies * protocol::StateStride> output{};
  std::array<double, protocol::MaxBodies * protocol::ObservableStride> observables{};
  std::array<char, protocol::FormulaSize * 3> formulas{};
  std::vector<double> forceOutput;
  std::vector<Body> bodies;
  std::vector<Link> links;
  std::vector<Vec2> forces;
  std::array<Vec2, protocol::MaxBodies> gravityVectors{}, beforeVelocity{};
  std::array<double, protocol::MaxBodies> beforeAngularVelocity{};
  std::array<std::array<Expression, 3>, protocol::MaxBodies> paths;
  std::array<bool, protocol::MaxBodies> driven{};
  std::vector<Swept> sweptBounds;
  Solver solver;
  StateHistory history;
  double gravity = 9.81;
  Vec2 localGrab{};
  int tickIndex = 0;
  bool valid = true;
  void record();
  void beginTick();
  double maximumStepDuration();
  void applyTrajectories(double time);
  void updateObservables();

public:
  double *inputData() { return input.data(); }
  double *outputData() { return output.data(); }
  double *observableData() { return observables.data(); }
  char *formulaData() { return formulas.data(); }
  double *forceData() { return forceOutput.data(); }
  double time() const { return tickIndex * protocol::TickDuration; }
  int reset(int count, int linkCount, double gravity);
  int editBody(int index, int field, double value);
  int setGravityVector(int index, double x, double y);
  int setForce(int index, double fx, double fy, double ax, double ay);
  int setGravity(double value);
  int setDragPoint(double x, double y);
  int editLink(int index, double length, double stiffness, double damping);
  int setTrajectory(int index, int enabled);
  int advance(int draggedBody, double x, double y);
  int sample(double time);
  int collectForceSamples();
  double relax();
};
