using UnityEngine;

namespace Insimul.Systems
{
    public interface IInteractable
    {
        string InteractionVerb { get; }
        bool CanInteract { get; }
        void Interact();
    }
}
