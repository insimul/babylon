// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulScenePlacement.cpp — implementation of the scene-generation placement
// math core (US-XG2). std-only; see InsimulScenePlacement.h for the contract.

#include "InsimulScenePlacement.h"

#include "InsimulCanonicalJson.h"

#include <algorithm>
#include <cmath>

namespace insimul {

namespace {

// Zone-based footprint scaling, mirroring the Unity SceneGenerator ZoneScale
// table + the runtime building_placement_system table.
double ZoneScaleForRole(const std::string& Role) {
	if (Role == "commercial") return 1.3;
	if (Role == "downtown") return 1.4;
	if (Role == "industrial") return 1.2;
	if (Role == "outskirts") return 0.9;
	// residential and anything unknown are unscaled.
	return 1.0;
}

double NumField(const FJsonValue& Obj, const std::string& Key, double Default) {
	const FJsonValue* V = Obj.Find(Key);
	return (V != nullptr && V->IsNumber()) ? V->NumberValue : Default;
}

// Read a {x,y,z} point object; absent components default to 0.
FSceneVec3 ReadPoint(const FJsonValue& Obj) {
	FSceneVec3 P;
	P.X = NumField(Obj, "x", 0.0);
	P.Y = NumField(Obj, "y", 0.0);
	P.Z = NumField(Obj, "z", 0.0);
	return P;
}

int CeilDiv(double A, double B) {
	if (B <= 0.0) return 1;
	return static_cast<int>(std::ceil(A / B));
}

// An archetype override on the IR entity, or `Fallback` if absent/empty.
std::string ArchetypeOr(const FJsonValue& Obj, const std::string& Fallback) {
	std::string A = Obj.GetString("archetype", "");
	return A.empty() ? Fallback : A;
}

// Resolve an archetype through the chain and fill assetRef/source on the node.
void ResolveNodeAsset(const FBindingResolver& Resolver, FPlacedNode& Node) {
	if (Node.Archetype.empty()) {
		return;
	}
	FResolveResult R = Resolver.Resolve(Node.Archetype);
	if (R.bResolved && R.Entry != nullptr) {
		Node.AssetRef = !R.Entry->Scene.empty() ? R.Entry->Scene : R.Entry->Mesh;
		Node.BindingSource = R.SourceName;
	}
}

// --- canonical-JSON node builders ------------------------------------------

FJsonValuePtr MakeString(const std::string& S) {
	auto V = std::make_shared<FJsonValue>();
	V->Type = EJsonType::String;
	V->StringValue = S;
	return V;
}

FJsonValuePtr MakeBool(bool B) {
	auto V = std::make_shared<FJsonValue>();
	V->Type = EJsonType::Bool;
	V->BoolValue = B;
	return V;
}

FJsonValuePtr MakeInt(long long N) {
	auto V = std::make_shared<FJsonValue>();
	V->Type = EJsonType::Number;
	V->NumberValue = static_cast<double>(N);
	return V;
}

// A number whose canonical form comes from the (already quantized) double.
FJsonValuePtr MakeNumber(double D) {
	auto V = std::make_shared<FJsonValue>();
	V->Type = EJsonType::Number;
	V->NumberValue = D;
	return V;
}

FJsonValuePtr MakeVec3(const FSceneVec3& P) {
	auto V = std::make_shared<FJsonValue>();
	V->Type = EJsonType::Object;
	V->ObjectItems.push_back({"x", MakeNumber(QuantizeSceneCoord(P.X))});
	V->ObjectItems.push_back({"y", MakeNumber(QuantizeSceneCoord(P.Y))});
	V->ObjectItems.push_back({"z", MakeNumber(QuantizeSceneCoord(P.Z))});
	return V;
}

} // namespace

double QuantizeSceneCoord(double Value) {
	if (!std::isfinite(Value)) return 0.0;
	// Round by scaling with the exact integer inverse and DIVIDING after the
	// round — dividing keeps the result on the cleanest nearby double (1.4 stays
	// "1.4"), whereas multiplying by the inexact 0.001 lexeme reintroduces float
	// noise ("1.4000000000000001").
	const double Inv = 1.0 / kSceneCoordQuantum; // 1000.0, exactly representable
	double Q = std::round(Value * Inv) / Inv;
	if (Q == 0.0) return 0.0; // normalize signed zero
	return Q;
}

double SampleTerrainHeight(const std::vector<double>& Heights, int Resolution,
		double SizeX, double SizeZ, double WorldX, double WorldZ) {
	if (Resolution < 1 || Heights.empty()) {
		return 0.0;
	}
	if (Resolution == 1) {
		return Heights[0];
	}
	if (SizeX <= 0.0 || SizeZ <= 0.0) {
		return Heights[0];
	}
	// World -> grid coordinates in [0, resolution-1], clamped to the edges.
	double Gx = (WorldX / SizeX) * (Resolution - 1);
	double Gz = (WorldZ / SizeZ) * (Resolution - 1);
	Gx = std::min(std::max(Gx, 0.0), static_cast<double>(Resolution - 1));
	Gz = std::min(std::max(Gz, 0.0), static_cast<double>(Resolution - 1));

	int X0 = static_cast<int>(std::floor(Gx));
	int Z0 = static_cast<int>(std::floor(Gz));
	int X1 = std::min(X0 + 1, Resolution - 1);
	int Z1 = std::min(Z0 + 1, Resolution - 1);
	double Fx = Gx - X0;
	double Fz = Gz - Z0;

	auto At = [&](int Gxi, int Gzi) -> double {
		std::size_t Idx = static_cast<std::size_t>(Gzi) * Resolution + Gxi;
		return Idx < Heights.size() ? Heights[Idx] : 0.0;
	};

	double H00 = At(X0, Z0);
	double H10 = At(X1, Z0);
	double H01 = At(X0, Z1);
	double H11 = At(X1, Z1);
	double Top = H00 + (H10 - H00) * Fx;
	double Bot = H01 + (H11 - H01) * Fx;
	return Top + (Bot - Top) * Fz;
}

FPlacementResult ComputePlacement(const FJsonValue& WorldIr, const FBindingResolver& Resolver) {
	FPlacementResult Result;
	if (!WorldIr.IsObject()) {
		Result.Error = "World IR root is not an object";
		return Result;
	}

	const FJsonValue* Meta = WorldIr.Find("meta");
	if (Meta != nullptr && Meta->IsObject()) {
		Result.Seed = Meta->GetString("seed", "");
	}

	const FJsonValue* Geography = WorldIr.Find("geography");
	const FJsonValue* Entities = WorldIr.Find("entities");

	// --- Terrain: heightmap + chunk grid ----------------------------------
	std::vector<double> Heights;
	int Resolution = 0;
	double SizeX = 0.0, SizeZ = 0.0, ChunkSize = 0.0;
	if (Geography != nullptr && Geography->IsObject()) {
		const FJsonValue* Terrain = Geography->Find("terrain");
		if (Terrain != nullptr && Terrain->IsObject()) {
			const FJsonValue* Size = Terrain->Find("size");
			if (Size != nullptr && Size->IsObject()) {
				SizeX = NumField(*Size, "x", 0.0);
				SizeZ = NumField(*Size, "z", 0.0);
			}
			ChunkSize = NumField(*Terrain, "chunkSize", 0.0);
			const FJsonValue* Hm = Terrain->Find("heightmap");
			if (Hm != nullptr && Hm->IsObject()) {
				Resolution = static_cast<int>(NumField(*Hm, "resolution", 0.0));
				const FJsonValue* Harr = Hm->Find("heights");
				if (Harr != nullptr && Harr->IsArray()) {
					for (const auto& H : Harr->ArrayItems) {
						Heights.push_back(H ? H->NumberValue : 0.0);
					}
				}
			}
		}
	}

	auto HeightAt = [&](double Wx, double Wz) -> double {
		return SampleTerrainHeight(Heights, Resolution, SizeX, SizeZ, Wx, Wz);
	};

	if (SizeX > 0.0 && SizeZ > 0.0 && ChunkSize > 0.0) {
		int ChunksX = CeilDiv(SizeX, ChunkSize);
		int ChunksZ = CeilDiv(SizeZ, ChunkSize);
		for (int Cz = 0; Cz < ChunksZ; ++Cz) {
			for (int Cx = 0; Cx < ChunksX; ++Cx) {
				FPlacedNode Node;
				Node.EntityId = "terrain.chunk." + std::to_string(Cx) + "_" + std::to_string(Cz);
				Node.Kind = "terrain_chunk";
				Node.Archetype = "terrain.chunk";
				double CentreX = Cx * ChunkSize + ChunkSize * 0.5;
				double CentreZ = Cz * ChunkSize + ChunkSize * 0.5;
				Node.Position = {CentreX, HeightAt(CentreX, CentreZ), CentreZ};
				ResolveNodeAsset(Resolver, Node);
				Result.Nodes.push_back(Node);
			}
		}
	}

	// --- Roads ------------------------------------------------------------
	if (Geography != nullptr && Geography->IsObject()) {
		const FJsonValue* Roads = Geography->Find("roads");
		if (Roads != nullptr && Roads->IsArray()) {
			for (const auto& R : Roads->ArrayItems) {
				if (!R || !R->IsObject()) continue;
				FPlacedNode Node;
				Node.EntityId = R->GetString("id", "");
				Node.Kind = "road";
				Node.Archetype = ArchetypeOr(*R, "terrain.texture.road");
				// Position at the centroid of the control points.
				const FJsonValue* Pts = R->Find("points");
				double Sx = 0.0, Sz = 0.0;
				int Count = 0;
				if (Pts != nullptr && Pts->IsArray()) {
					for (const auto& P : Pts->ArrayItems) {
						if (!P || !P->IsObject()) continue;
						FSceneVec3 Pv = ReadPoint(*P);
						Sx += Pv.X;
						Sz += Pv.Z;
						++Count;
					}
				}
				double Cx = Count > 0 ? Sx / Count : 0.0;
				double Cz = Count > 0 ? Sz / Count : 0.0;
				Node.Position = {Cx, HeightAt(Cx, Cz), Cz};
				ResolveNodeAsset(Resolver, Node);
				Result.Nodes.push_back(Node);
			}
		}
	}

	// --- Buildings (+ interiors) ------------------------------------------
	if (Entities != nullptr && Entities->IsObject()) {
		const FJsonValue* Buildings = Entities->Find("buildings");
		if (Buildings != nullptr && Buildings->IsArray()) {
			for (const auto& B : Buildings->ArrayItems) {
				if (!B || !B->IsObject()) continue;
				std::string Role = B->GetString("role", "residential");
				FPlacedNode Node;
				Node.EntityId = B->GetString("id", "");
				Node.Kind = "building";
				Node.Archetype = ArchetypeOr(*B, "building." + Role);
				const FJsonValue* Pos = B->Find("position");
				FSceneVec3 P = (Pos != nullptr && Pos->IsObject()) ? ReadPoint(*Pos) : FSceneVec3{};
				// Snap footprint to the placement grid, sample terrain height.
				double SnappedX = std::round(P.X / kSceneGridSize) * kSceneGridSize;
				double SnappedZ = std::round(P.Z / kSceneGridSize) * kSceneGridSize;
				Node.Position = {SnappedX, HeightAt(SnappedX, SnappedZ), SnappedZ};
				Node.RotationY = NumField(*B, "rotation", 0.0);
				double S = ZoneScaleForRole(Role);
				Node.Scale = {S, S, S};
				ResolveNodeAsset(Resolver, Node);
				Result.Nodes.push_back(Node);

				// Interior as a SEPARATE Level Instance at origin (the door-warp
				// convention). Unreal has no `interior` taxonomy root, so it
				// carries no binding archetype.
				const FJsonValue* Iv = B->Find("interior");
				bool bHasInterior = (Iv != nullptr && Iv->Type == EJsonType::Bool && Iv->BoolValue);
				if (bHasInterior) {
					FPlacedNode Interior;
					Interior.EntityId = Node.EntityId + ".interior";
					Interior.Kind = "interior";
					Interior.Archetype = "";
					Interior.Position = {0.0, 0.0, 0.0};
					Result.Nodes.push_back(Interior);
				}
			}
		}

		// --- Props --------------------------------------------------------
		const FJsonValue* Props = Entities->Find("props");
		if (Props != nullptr && Props->IsArray()) {
			for (const auto& Pr : Props->ArrayItems) {
				if (!Pr || !Pr->IsObject()) continue;
				std::string Kind = Pr->GetString("kind", "generic");
				FPlacedNode Node;
				Node.EntityId = Pr->GetString("id", "");
				Node.Kind = "prop";
				Node.Archetype = ArchetypeOr(*Pr, "prop." + Kind);
				const FJsonValue* Pos = Pr->Find("position");
				FSceneVec3 P = (Pos != nullptr && Pos->IsObject()) ? ReadPoint(*Pos) : FSceneVec3{};
				Node.Position = {P.X, HeightAt(P.X, P.Z), P.Z};
				Node.RotationY = NumField(*Pr, "rotation", 0.0);
				ResolveNodeAsset(Resolver, Node);
				Result.Nodes.push_back(Node);
			}
		}
	}

	// --- Navigation bake root (single, no binding) ------------------------
	{
		FPlacedNode Nav;
		Nav.EntityId = "nav.region";
		Nav.Kind = "nav_region";
		Nav.Archetype = "";
		Nav.Position = {0.0, 0.0, 0.0};
		Result.Nodes.push_back(Nav);
	}

	// Canonical order: stable sort by entityId ascending (ordinal).
	std::stable_sort(Result.Nodes.begin(), Result.Nodes.end(),
			[](const FPlacedNode& A, const FPlacedNode& B) { return A.EntityId < B.EntityId; });

	Result.bOk = true;
	return Result;
}

std::string SerializePlacementManifest(const FPlacementResult& Result) {
	auto Root = std::make_shared<FJsonValue>();
	Root->Type = EJsonType::Object;
	Root->ObjectItems.push_back({"manifestVersion", MakeInt(1)});
	Root->ObjectItems.push_back({"seed", MakeString(Result.Seed)});
	Root->ObjectItems.push_back({"nodeCount", MakeInt(static_cast<long long>(Result.Nodes.size()))});

	auto Nodes = std::make_shared<FJsonValue>();
	Nodes->Type = EJsonType::Array;
	for (const FPlacedNode& N : Result.Nodes) {
		auto Obj = std::make_shared<FJsonValue>();
		Obj->Type = EJsonType::Object;
		Obj->ObjectItems.push_back({"entityId", MakeString(N.EntityId)});
		Obj->ObjectItems.push_back({"kind", MakeString(N.Kind)});
		Obj->ObjectItems.push_back({"archetype", MakeString(N.Archetype)});
		Obj->ObjectItems.push_back({"assetRef", MakeString(N.AssetRef)});
		Obj->ObjectItems.push_back({"bindingSource", MakeString(N.BindingSource)});
		Obj->ObjectItems.push_back({"generated", MakeBool(N.bGenerated)});
		Obj->ObjectItems.push_back({"position", MakeVec3(N.Position)});
		Obj->ObjectItems.push_back({"rotationY", MakeNumber(QuantizeSceneCoord(N.RotationY))});
		Obj->ObjectItems.push_back({"scale", MakeVec3(N.Scale)});
		Nodes->ArrayItems.push_back(Obj);
	}
	Root->ObjectItems.push_back({"nodes", Nodes});

	return CanonicalJsonStringify(*Root);
}

} // namespace insimul
