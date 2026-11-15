#include <manifold/manifold.h>
#include <oneapi/tbb/global_control.h>
#include <algorithm>
#include <bit>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <thread>
#include <type_traits>
#include <vector>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

using manifold::Manifold;
constexpr uint32_t magic = 0x46524d31;
constexpr uint32_t replyMagic = 0x46524d32;
constexpr size_t budget = 512 * 1024 * 1024;
size_t consumed = 0;
static_assert(std::endian::native == std::endian::little);

void readBytes(void* data, size_t bytes) {
  if (bytes > budget - consumed) throw std::runtime_error("Export transfer budget exceeded");
  consumed += bytes;
  if (!std::cin.read(static_cast<char*>(data), bytes)) throw std::runtime_error("Truncated mesh input");
}
template<class T> T read() {
  T value;
  readBytes(&value, sizeof(value));
  if constexpr (std::is_floating_point_v<T>)
    if (!std::isfinite(value)) throw std::runtime_error("Nonfinite mesh parameter");
  return value;
}
template<class T> void write(T value) {
  std::cout.write(reinterpret_cast<const char*>(&value), sizeof(value));
}
Manifold meshInput() {
  const auto vertices = read<uint32_t>(), triangles = read<uint32_t>();
  const uint64_t bytes = 12ull * (uint64_t(vertices) + triangles);
  if (!vertices || !triangles || bytes > budget - consumed)
    throw std::runtime_error("Invalid mesh size");
  manifold::MeshGL mesh;
  mesh.numProp = 3;
  mesh.vertProperties.resize(size_t(vertices) * 3);
  mesh.triVerts.resize(size_t(triangles) * 3);
  readBytes(mesh.vertProperties.data(), size_t(vertices) * 12);
  readBytes(mesh.triVerts.data(), size_t(triangles) * 12);
  for (const auto v : mesh.vertProperties)
    if (!std::isfinite(v)) throw std::runtime_error("Nonfinite mesh vertex");
  for (const auto v : mesh.triVerts)
    if (v >= vertices) throw std::runtime_error("Invalid triangle index");
  Manifold result(mesh);
  if (result.Status() != Manifold::Error::NoError) throw std::runtime_error("Invalid input manifold");
  return result;
}
Manifold operation(const std::vector<Manifold>& nodes) {
  const auto opcode = read<uint32_t>();
  if (opcode == 0) return meshInput();
  if (opcode == 5) {
    const auto height = read<double>(), radius = read<double>();
    const auto segments = read<uint32_t>();
    if (height <= 0 || radius <= 0 || segments < 3 || segments > 1000000)
      throw std::runtime_error("Invalid cylinder");
    return Manifold::Cylinder(height, radius, radius, segments);
  }
  const auto a = read<uint32_t>();
  if (a >= nodes.size()) throw std::runtime_error("Invalid mesh operand");
  if (opcode >= 1 && opcode <= 3) {
    const auto b = read<uint32_t>();
    if (b >= nodes.size()) throw std::runtime_error("Invalid mesh operand");
    return nodes[a].Boolean(nodes[b], opcode == 1 ? manifold::OpType::Add :
      opcode == 2 ? manifold::OpType::Subtract : manifold::OpType::Intersect);
  }
  if (opcode == 4) {
    const auto x = read<double>(), y = read<double>(), z = read<double>(), offset = read<double>();
    if (x == 0 && y == 0 && z == 0) throw std::runtime_error("Invalid trim normal");
    return nodes[a].TrimByPlane({x, y, z}, offset);
  }
  if (opcode == 6) {
    manifold::mat3x4 matrix;
    for (int column = 0; column < 4; column++) {
      for (int row = 0; row < 3; row++) matrix[column][row] = read<double>();
      const auto last = read<double>();
      if (last != (column == 3 ? 1 : 0)) throw std::runtime_error("Invalid affine transform");
    }
    return nodes[a].Transform(matrix);
  }
  throw std::runtime_error("Unknown mesh operation");
}
void integrate() {
  if (read<uint32_t>() != magic) throw std::runtime_error("Invalid mesh protocol");
  const auto count = read<uint32_t>(), root = read<uint32_t>();
  const auto precision = read<double>();
  if (!count || count > 100000 || root >= count || precision <= 0)
    throw std::runtime_error("Invalid export plan");
  std::vector<Manifold> nodes;
  nodes.reserve(count);
  for (uint32_t i = 0; i < count; i++) nodes.push_back(operation(nodes));
  if (std::cin.peek() != std::char_traits<char>::eof()) throw std::runtime_error("Trailing mesh input");
  const auto& result = nodes[root];
  if (result.Status() != Manifold::Error::NoError) throw std::runtime_error("Native mesh Boolean failed");
  const auto tolerance = result.GetTolerance();
  if (!std::isfinite(tolerance) || tolerance > precision)
    throw std::runtime_error("This body's extent exceeds the thread mesh precision budget");
  const auto mesh = result.GetMeshGL64();
  if (20ull + mesh.vertProperties.size() * 8ull + mesh.triVerts.size() * 4ull > budget)
    throw std::runtime_error("Native export result exceeds transfer budget");
  write(replyMagic);
  write(uint32_t(mesh.vertProperties.size() / 3));
  write(uint32_t(mesh.triVerts.size() / 3));
  write(tolerance);
  std::cout.write(reinterpret_cast<const char*>(mesh.vertProperties.data()), mesh.vertProperties.size() * sizeof(double));
  const std::vector<uint32_t> indices(mesh.triVerts.begin(), mesh.triVerts.end());
  std::cout.write(reinterpret_cast<const char*>(indices.data()), indices.size() * sizeof(uint32_t));
}
int main() {
#ifdef _WIN32
  _setmode(_fileno(stdin), _O_BINARY);
  _setmode(_fileno(stdout), _O_BINARY);
#endif
  std::ios::sync_with_stdio(false);
  const char* configured = std::getenv("MAKESHIFT_MESH_THREADS");
  if (!configured) configured = std::getenv("FREAC_MESH_THREADS");
  const auto threads = configured ? unsigned(std::clamp(std::atoi(configured), 1, 8)) :
    std::min(4u, std::max(1u, std::thread::hardware_concurrency()));
  // Bound a single export's worker count, leaving room for the host and viewport.
  oneapi::tbb::global_control parallelism(oneapi::tbb::global_control::max_allowed_parallelism,
    threads);
  try { integrate(); return std::cout ? 0 : 1; }
  catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
