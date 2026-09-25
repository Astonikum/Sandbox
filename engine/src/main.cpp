#include "core.hpp"
#include <iomanip>
#include <iostream>
int main() {
  Solver solver;
  std::cout << std::setprecision(15);
  int count, linkCount, draggedBody;
  double gravity, dt;
  Vec2 target;
  while (std::cin >> count >> linkCount >> gravity >> dt >> draggedBody >> target.x >> target.y) {
    if (count < 0 || count > 200 || linkCount < 0 || linkCount > 400 || dt <= 0 || dt > .05 ||
        !std::isfinite(gravity) || std::abs(gravity) > 100 || !std::isfinite(dt) ||
        !std::isfinite(target.x) || !std::isfinite(target.y))
      return 1;
    std::vector<Body> bodies(count);
    std::vector<Vec2> forces(count);
    std::vector<Link> links(linkCount);
    for (int i = 0; i < count; ++i) {
      auto &body = bodies[i];
      std::cin >> body.kind >> body.position.x >> body.position.y >> body.width >> body.height >>
          body.angle >> body.mass >> body.friction >> body.restitution >> body.velocity.x >>
          body.velocity.y >> body.angularVelocity >> body.fixed >> forces[i].x >> forces[i].y;
      if (body.mass <= 0 || body.width < .001 || body.height < .001 || body.friction < 0 ||
          body.restitution < 0 || body.restitution > 1)
        return 1;
      for (double v : {body.position.x, body.position.y, body.width, body.height, body.angle,
                       body.mass, body.friction, body.restitution, body.velocity.x, body.velocity.y,
                       body.angularVelocity, forces[i].x, forces[i].y})
        if (!std::isfinite(v) || std::abs(v) > 1e8)
          return 1;
    }
    for (auto &link : links) {
      std::cin >> link.kind >> link.bodyA >> link.bodyB >> link.anchor.x >> link.anchor.y >>
          link.localAnchorA.x >> link.localAnchorA.y >> link.localAnchorB.x >>
          link.localAnchorB.y >> link.length >> link.stiffness >> link.damping;
      if (link.bodyA < 0 || link.bodyA >= count || link.bodyB >= count || link.bodyB < -1 ||
          link.length < 0 || link.stiffness < 0 || link.damping < 0)
        return 1;
      for (double v :
           {link.anchor.x, link.anchor.y, link.localAnchorA.x, link.localAnchorA.y,
            link.localAnchorB.x, link.localAnchorB.y, link.length, link.stiffness, link.damping})
        if (!std::isfinite(v) || std::abs(v) > 1e8)
          return 1;
    }
    if (!std::cin)
      return 1;
    int substeps = std::max(1, (int)std::ceil(dt / .0005));
    for (int k = 0; k < substeps; ++k)
      solver.step(bodies, links, forces, gravity, dt / substeps, draggedBody, target);
    for (auto &body : bodies)
      std::cout << body.position.x << ' ' << body.position.y << ' ' << body.angle << ' '
                << body.velocity.x << ' ' << body.velocity.y << ' ' << body.angularVelocity << ' ';
    std::cout << std::endl;
  }
}
