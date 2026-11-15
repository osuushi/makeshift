#pragma once
#include "boundary-move.h"
#include <gp_Pln.hxx>

namespace delete_band {
struct Band {
    TopTools_IndexedMapOfShape selected;
    std::vector<TopoDS_Wire> loops;
    std::vector<std::optional<gp_Pln>> planes;
};
Band inspect(const Operand&, const std::vector<SourceEntity>&);
boundary_move::Edit flatten(const Operand&, const Band&, int anchor);
TopoDS_Wire mappedWire(const TopoDS_Wire&, const boundary_move::Edit&);
Result rebuild(const Operand&, const Band&, const boundary_move::Edit&, const TopoDS_Face&);
Result flattenBand(const Operand&, const std::vector<SourceEntity>&);
}
