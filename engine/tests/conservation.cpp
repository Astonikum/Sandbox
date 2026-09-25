#include "../src/core.hpp"
#include <cassert>
#include <iostream>

static double kinetic(const Body &b) {
  return .5 * b.mass * dot(b.velocity, b.velocity) +
         (b.inverseInertia() > 0 ? .5 * b.angularVelocity * b.angularVelocity / b.inverseInertia()
                                 : 0);
}
static Body disk(double x, double vx, double mass = 1) {
  return {1, {x, 0}, {vx, 0}, .1, .1, 0, mass, 0, 1, 0, false};
}

int main() {
  Solver solver;

  for (double angle : {0., .4, 1.2, 2.7})
    for (double side : {-1., 1.}) {
      Body floor{9, {0, 0}, {}, 4, .6, angle, 0, 0, 0, 0, true};
      Vec2 normal = floor.axis(1) * side, center = contactCenter(floor);
      Body ball = disk(0, 0);
      ball.position = center + normal * .049;
      ball.velocity = normal * (-1);
      solveContact(ball, floor);
      assert(std::abs(dot(ball.velocity, normal)) < 1e-10);
      assert(length(ball.normalImpulse - normal) < 1e-10);
      ball.position = center + floor.axis(1) * .5;
      ball.velocity = floor.axis(1) * (-1);
      solveContact(ball, floor);
      assert(length(ball.velocity + floor.axis(1)) < 1e-10);
      ball.position = center + floor.axis(0) * 2.2;
      ball.velocity = floor.axis(0) * (-1);
      solveContact(ball, floor);
      assert(length(ball.velocity + floor.axis(0)) < 1e-10);
    }
  std::cout << "PASS finite surface: rotated contacts, both sides, no phantom thickness\n";

  for (double restitution : {0., .5, 1.}) {
    std::vector<Body> bs{disk(-.3, 1), disk(.3, -1, 2)};
    bs[0].restitution = bs[1].restitution = restitution;
    std::vector<Vec2> forces(2);
    const double momentum = -1, initialEnergy = 1.5;
    for (int i = 0; i < 1000; ++i)
      solver.step(bs, {}, forces, 0, .001, -1, {});
    assert(std::abs(bs[0].velocity.x + 2 * bs[1].velocity.x - momentum) < 1e-10);
    assert(std::abs(bs[1].velocity.x - bs[0].velocity.x - 2 * restitution) < 1e-9);
    const double lostEnergy = .5 * (2. / 3.) * (1 - restitution * restitution) * 4;
    assert(std::abs(kinetic(bs[0]) + kinetic(bs[1]) - (initialEnergy - lostEnergy)) < 1e-9);
    assert(length(bs[0].normalImpulse + bs[1].normalImpulse) < 1e-10);
  }

  double coarseDrift = 0;
  for (double dt : {.001, .0005}) {
    std::vector<Body> bs{disk(-.75, 0), disk(.75, 0, 2)};
    std::vector<Vec2> forces(2);
    Link spring{3, 0, 1, {}, {}, {}, 1, 10, 0};
    const double initialEnergy = 1.25;
    double drift = 0;
    for (int i = 0; i < int(4 / dt); ++i) {
      solver.step(bs, {spring}, forces, 0, dt, -1, {});
      const double stretch = length(bs[1].position - bs[0].position) - spring.length;
      const double energy =
          kinetic(bs[0]) + kinetic(bs[1]) + .5 * spring.stiffness * stretch * stretch;
      drift = std::max(drift, std::abs(energy - initialEnergy));
      assert(length(bs[0].velocity * bs[0].mass + bs[1].velocity * bs[1].mass) < 1e-10);
    }
    assert(drift < .003);
    if (dt == .001)
      coarseDrift = drift;
    else
      assert(drift < coarseDrift * .51);
  }

  std::vector<Body> bs{disk(-.75, 0), disk(.75, 0, 2)};
  std::vector<Vec2> forces(2);
  Link damped{3, 0, 1, {}, {}, {}, 1, 10, 1};
  double dissipated = 0;
  constexpr double dt = .0005;
  for (int i = 0; i < 8000; ++i) {
    const Vec2 n = normalized(bs[1].position - bs[0].position);
    const double relative = dot(bs[1].velocity - bs[0].velocity, n);
    dissipated += damped.damping * relative * relative * dt;
    solver.step(bs, {damped}, forces, 0, dt, -1, {});
  }
  const double stretch = length(bs[1].position - bs[0].position) - damped.length;
  const double energy = kinetic(bs[0]) + kinetic(bs[1]) + .5 * damped.stiffness * stretch * stretch;
  assert(energy < .01);
  assert(std::abs(energy + dissipated - 1.25) < .002);
  assert(length(bs[0].velocity + bs[1].velocity * 2) < 1e-10);
  std::cout << "PASS conservation: elastic/inelastic impacts, spring momentum/energy, step "
               "convergence, damping work balance\n";
}
