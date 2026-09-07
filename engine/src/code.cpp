#include <iostream>

class MovingObject {
    private:
        double x, y; // Position coordinates
        double vx, vy; // Velocity components
        int m; // materail

    public:
        double getX() const { return x; }
        double getY() const { return y; }
        double getVx() const { return vx; }
        double getVy() const { return vy; }
        void setPosition(double newX, double newY) {x = newX; y = newY;}
        void setVelocity(double newVx, double newVy) {vx = newVx; vy = newVy;}

}