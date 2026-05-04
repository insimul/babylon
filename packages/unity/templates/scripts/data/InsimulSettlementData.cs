using System;
using UnityEngine;

namespace Insimul.Data
{
    [Serializable]
    public class InsimulStreetNode
    {
        public string id;
        public Vec3Data position;
        public string[] intersectionOf;
    }

    [Serializable]
    public class InsimulStreetSegment
    {
        public string id;
        public string name;
        public string direction;
        public string[] nodeIds;
        public Vec3Data[] waypoints;
        public float width = 2.5f;
    }

    [Serializable]
    public class InsimulStreetNetwork
    {
        public string layout;
        public InsimulStreetNode[] nodes;
        public InsimulStreetSegment[] segments;
    }

    [Serializable]
    public class InsimulSettlementData
    {
        public string id;
        public string name;
        public string description;
        public string settlementType;
        public int population = 100;
        public Vec3Data position;
        public float radius = 20f;
        public string countryId;
        public string stateId;
        public string mayorId;

        // Elevation profile (null if no heightmap available)
        public float minElevation;
        public float maxElevation;
        public float meanElevation;
        public float elevationRange;
        public string slopeClass = "flat";

        public InsimulLotData[] lots;
        public InsimulStreetNetwork streetNetwork;
        /// <summary>Game-format streets mapped from streetNetwork with re-centered waypoints.</summary>
        public GameStreet[] streets;
    }

    /// <summary>
    /// A street in game-format coordinates, produced by mapping IR streetNetwork
    /// segments with re-centered waypoints. Matches the 'streets' array from
    /// FileDataSource.loadSettlements().
    /// </summary>
    [Serializable]
    public class GameStreet
    {
        public string id;
        public string name;
        public Vec3Data[] waypoints;
        public float width;
    }

    [Serializable]
    public class InsimulStreetNetworkData
    {
        public InsimulStreetNodeData[] nodes;
        public InsimulStreetEdgeData[] edges;
    }

    [Serializable]
    public class InsimulStreetNodeData
    {
        public string id;
        public Vec2Data position;
        public float elevation;
        public string type;
    }

    [Serializable]
    public class InsimulStreetEdgeData
    {
        public string id;
        public string name;
        public string fromNodeId;
        public string toNodeId;
        public string streetType;
        public float width;
        public Vec3Data[] waypoints;
        public float length;
        public float condition;
        public float traffic;
        public bool sidewalks;
        public bool hasStreetLights;
    }

    [Serializable]
    public class Vec2Data
    {
        public float x;
        public float z;
    }
}
