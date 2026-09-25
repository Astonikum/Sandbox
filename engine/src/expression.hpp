#pragma once
#include <string>
#include <vector>

struct Jet {
  double value = 0, derivative = 0, secondDerivative = 0;
};

class Expression {
  struct Node {
    std::string operation;
    double number = 0;
    int left = -1, right = -1;
  };
  std::vector<Node> nodes;
  std::string source;
  size_t position = 0;
  void skipWhitespace();
  bool consume(char character);
  int appendNode(Node node);
  int parseSum();
  int parseProduct();
  int parseUnary();
  int parseAtom();
  Jet evaluate(int index, double time) const;

public:
  void compile(const std::string &text);
  Jet at(double time) const;
};
