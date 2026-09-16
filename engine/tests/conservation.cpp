#include "../src/core.hpp"
#include <cassert>
#include <iostream>

static double kinetic(const Body& b) {
  return .5 * b.mass * dot(b.v, b.v) + (b.ii() > 0 ? .5 * b.omega * b.omega / b.ii() : 0);
}
static Body disk(double x, double vx, double mass = 1) {
  return {1, {x, 0}, {vx, 0}, .1, .1, 0, mass, 0, 1, 0, false};
}

int main() {
  // Both bodies are free: internal collision impulses must cancel.
  for (double restitution : {0., .5, 1.}) {
    std::vector<Body> bs{disk(-.3, 1), disk(.3, -1, 2)};
    bs[0].e = bs[1].e = restitution;
    std::vector<V> forces(2);
    const double momentum = -1, initialEnergy = 1.5;
    for (int i = 0; i < 1000; ++i) step(bs, {}, forces, 0, .001, -1, {});
    assert(std::abs(bs[0].v.x + 2 * bs[1].v.x - momentum) < 1e-10);
    assert(std::abs(bs[1].v.x - bs[0].v.x - 2 * restitution) < 1e-9);
    const double lostEnergy = .5 * (2. / 3.) * (1 - restitution * restitution) * 4;
    assert(std::abs(kinetic(bs[0]) + kinetic(bs[1]) - (initialEnergy - lostEnergy)) < 1e-9);
    assert(norm(bs[0].normalImpulse + bs[1].normalImpulse) < 1e-10);
  }

  // Spring impulses and spring potential describe the same interaction.
  double coarseDrift = 0;
  for (double dt : {.001, .0005}) {
    std::vector<Body> bs{disk(-.75, 0), disk(.75, 0, 2)};
    std::vector<V> forces(2);
    Link spring{3, 0, 1, {}, {}, {}, 1, 10, 0};
    const double initialEnergy = 1.25;
    double drift = 0;
    for (int i = 0; i < int(4 / dt); ++i) {
      step(bs, {spring}, forces, 0, dt, -1, {});
      const double stretch = norm(bs[1].p - bs[0].p) - spring.length;
      const double energy = kinetic(bs[0]) + kinetic(bs[1]) + .5 * spring.k * stretch * stretch;
      drift = std::max(drift, std::abs(energy - initialEnergy));
      assert(norm(bs[0].v * bs[0].mass + bs[1].v * bs[1].mass) < 1e-10);
    }
    assert(drift < .003);
    if (dt == .001) coarseDrift = drift;
    else assert(drift < coarseDrift * .51);
  }

  std::vector<Body> bs{disk(-.75, 0), disk(.75, 0, 2)};
  std::vector<V> forces(2);
  Link damped{3, 0, 1, {}, {}, {}, 1, 10, 1};
  double dissipated = 0;
  constexpr double dt = .0005;
  for (int i = 0; i < 8000; ++i) {
    const V n = unit(bs[1].p - bs[0].p);
    const double relative = dot(bs[1].v - bs[0].v, n);
    dissipated += damped.damping * relative * relative * dt;
    step(bs, {damped}, forces, 0, dt, -1, {});
  }
  const double stretch = norm(bs[1].p - bs[0].p) - damped.length;
  const double energy = kinetic(bs[0]) + kinetic(bs[1]) + .5 * damped.k * stretch * stretch;
  assert(energy < .01);
  assert(std::abs(energy + dissipated - 1.25) < .002);
  assert(norm(bs[0].v + bs[1].v * 2) < 1e-10);
  std::cout << "PASS conservation: elastic/inelastic impacts, spring momentum/energy, step convergence, damping work balance\n";
}
