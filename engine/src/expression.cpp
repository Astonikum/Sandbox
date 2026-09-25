#include "expression.hpp"
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <stdexcept>

namespace {
Jet multiply(Jet left, Jet right) {
  return {left.value * right.value, left.derivative * right.value + left.value * right.derivative,
          left.secondDerivative * right.value + 2 * left.derivative * right.derivative +
              left.value * right.secondDerivative};
}
Jet compose(Jet left, double f, double df, double ddf) {
  return {f, df * left.derivative,
          ddf * left.derivative * left.derivative + df * left.secondDerivative};
}
}
void Expression::skipWhitespace() {
  while (position < source.size() && std::isspace((unsigned char)source[position]))
    ++position;
}

bool Expression::consume(char c) {
  skipWhitespace();
  if (position < source.size() && source[position] == c) {
    ++position;
    return true;
  }
  return false;
}

int Expression::appendNode(Node n) {
  if (nodes.size() >= 128)
    throw std::runtime_error("Formula too complex");
  nodes.push_back(n);
  return (int)nodes.size() - 1;
}

int Expression::parseSum() {
  int left = parseProduct();
  for (;;) {
    if (consume('+'))
      left = appendNode({"+", 0, left, parseProduct()});
    else if (consume('-'))
      left = appendNode({"-", 0, left, parseProduct()});
    else
      return left;
  }
}

int Expression::parseProduct() {
  int left = parseUnary();
  for (;;) {
    if (consume('*'))
      left = appendNode({"*", 0, left, parseUnary()});
    else if (consume('/'))
      left = appendNode({"/", 0, left, parseUnary()});
    else
      return left;
  }
}

int Expression::parseUnary() {
  if (consume('+'))
    return parseUnary();
  if (consume('-'))
    return appendNode({"neg", 0, parseUnary()});
  int left = parseAtom();
  if (consume('^'))
    left = appendNode({"^", 0, left, parseUnary()});
  return left;
}

int Expression::parseAtom() {
  if (consume('(')) {
    int left = parseSum();
    if (!consume(')'))
      throw std::runtime_error("Missing )");
    return left;
  }
  skipWhitespace();
  if (position >= source.size())
    throw std::runtime_error("Incomplete formula");
  if (std::isdigit((unsigned char)source[position]) || source[position] == '.') {
    char *end;
    double n = std::strtod(source.c_str() + position, &end);
    if (end == source.c_str() + position || !std::isfinite(n))
      throw std::runtime_error("Invalid number");
    position = end - source.c_str();
    return appendNode({"n", n});
  }
  size_t start = position;
  while (position < source.size() && std::isalpha((unsigned char)source[position]))
    ++position;
  std::string name = source.substr(start, position - start);
  if (name == "t")
    return appendNode({"t"});
  if (name == "pi")
    return appendNode({"n", 3.14159265358979323846});
  if (name != "sin" && name != "cos" && name != "exp" && name != "log" && name != "sqrt")
    throw std::runtime_error("Unknown symbol");
  if (!consume('('))
    throw std::runtime_error("Expected (");
  int left = parseSum();
  if (!consume(')'))
    throw std::runtime_error("Missing )");
  return appendNode({name, 0, left});
}

Jet Expression::evaluate(int i, double t) const {
  const auto &n = nodes[i];
  if (n.operation == "n")
    return {n.number};
  if (n.operation == "t")
    return {t, 1, 0};
  Jet left = evaluate(n.left, t), right = n.right >= 0 ? evaluate(n.right, t) : Jet{};
  if (n.operation == "+")
    return {left.value + right.value, left.derivative + right.derivative,
            left.secondDerivative + right.secondDerivative};
  if (n.operation == "-")
    return {left.value - right.value, left.derivative - right.derivative,
            left.secondDerivative - right.secondDerivative};
  if (n.operation == "neg")
    return {-left.value, -left.derivative, -left.secondDerivative};
  if (n.operation == "*")
    return multiply(left, right);
  if (n.operation == "/")
    return multiply(left, compose(right, 1 / right.value, -1 / (right.value * right.value),
                                  2 / (right.value * right.value * right.value)));
  if (n.operation == "sin")
    return compose(left, std::sin(left.value), std::cos(left.value), -std::sin(left.value));
  if (n.operation == "cos")
    return compose(left, std::cos(left.value), -std::sin(left.value), -std::cos(left.value));
  if (n.operation == "exp") {
    double e = std::exp(left.value);
    return compose(left, e, e, e);
  }
  if (n.operation == "log")
    return compose(left, std::log(left.value), 1 / left.value, -1 / (left.value * left.value));
  if (n.operation == "sqrt") {
    double r = std::sqrt(left.value);
    return compose(left, r, .5 / r, -.25 / (r * r * r));
  }
  if (right.derivative == 0 && right.secondDerivative == 0) {
    if (right.value == 0)
      return {1};
    if (right.value == 1)
      return left;
    double p = std::pow(left.value, right.value);
    return compose(left, p, right.value * std::pow(left.value, right.value - 1),
                   right.value * (right.value - 1) * std::pow(left.value, right.value - 2));
  }
  Jet l = compose(left, std::log(left.value), 1 / left.value, -1 / (left.value * left.value)),
      z = multiply(right, l);
  double e = std::exp(z.value);
  return compose(z, e, e, e);
}

void Expression::compile(const std::string &text) {
  source = text;
  position = 0;
  nodes.clear();
  if (text.empty() || text.size() > 255)
    throw std::runtime_error("Formula length");
  parseSum();
  skipWhitespace();
  if (position != source.size())
    throw std::runtime_error("Unexpected character");
}

Jet Expression::at(double t) const {
  Jet j = evaluate((int)nodes.size() - 1, t);
  if (!std::isfinite(j.value) || !std::isfinite(j.derivative) || !std::isfinite(j.secondDerivative))
    throw std::runtime_error("Formula domain error");
  return j;
}
