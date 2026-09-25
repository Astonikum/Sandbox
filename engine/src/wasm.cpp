#include "runtime.hpp"

namespace {
Runtime runtime;
}

extern "C" {
double *engine_input() { return runtime.inputData(); }
double *engine_output() { return runtime.outputData(); }
char *engine_formulas() { return runtime.formulaData(); }
double *engine_observables() { return runtime.observableData(); }
int engine_force_count() { return runtime.collectForceSamples(); }
double *engine_force_output() { return runtime.forceData(); }
int engine_reset(int count, int links, double gravity) {
  return runtime.reset(count, links, gravity);
}
int engine_body(int index, int field, double value) {
  return runtime.editBody(index, field, value);
}
int engine_gravity_vector(int index, double x, double y) {
  return runtime.setGravityVector(index, x, y);
}
int engine_force(int index, double fx, double fy, double ax, double ay) {
  return runtime.setForce(index, fx, fy, ax, ay);
}
int engine_gravity(double gravity) { return runtime.setGravity(gravity); }
int engine_drag_point(double x, double y) { return runtime.setDragPoint(x, y); }
int engine_link(int index, double length, double stiffness, double damping) {
  return runtime.editLink(index, length, stiffness, damping);
}
int engine_trajectory(int index, int enabled) { return runtime.setTrajectory(index, enabled); }
int engine_tick(int index, double x, double y) { return runtime.advance(index, x, y); }
double engine_time() { return runtime.time(); }
double engine_relax() { return runtime.relax(); }
int engine_sample(double time) { return runtime.sample(time); }
}
