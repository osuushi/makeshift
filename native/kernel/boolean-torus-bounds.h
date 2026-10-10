#pragma once
#include <Bnd_Box.hxx>
#include <gp_Torus.hxx>
#include <array>

namespace boolean_uv {
void boundTorus(const gp_Torus&, const std::array<double,4>& uv, double padding, Bnd_Box&);
}
