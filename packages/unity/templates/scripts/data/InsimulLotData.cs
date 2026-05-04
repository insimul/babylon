using System;
using UnityEngine;

namespace Insimul.Data
{
    [Serializable]
    public class InsimulLotData
    {
        public string id;
        public string address;
        public int houseNumber;
        public string streetName;
        public string block;
        public string districtName;
        public Vec3Data position;
        public string buildingType;
        public string buildingId;
    }
}
