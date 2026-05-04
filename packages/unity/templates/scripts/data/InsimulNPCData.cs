using System;
using UnityEngine;

namespace Insimul.Data
{
    [Serializable]
    public class ScheduleBlockData
    {
        public float startHour;
        public float endHour;
        public string activity;
        public string buildingId;
        public int priority;
    }

    [Serializable]
    public class NPCScheduleData
    {
        public string homeBuildingId;
        public string workBuildingId;
        public string[] friendBuildingIds;
        public ScheduleBlockData[] blocks;
        public float wakeHour;
        public float bedtimeHour;
    }

    [Serializable]
    public class InsimulNPCData
    {
        public string characterId;
        public string role;
        public Vec3Data homePosition;
        public float patrolRadius = 20f;
        public float disposition = 50f;
        public string settlementId;
        public string[] questIds;
        public string greeting;
        public NPCScheduleData schedule;
    }

    [Serializable]
    public class Vec3Data
    {
        public float x;
        public float y;
        public float z;

        public Vector3 ToVector3() => new Vector3(x, y, z);
    }
}
