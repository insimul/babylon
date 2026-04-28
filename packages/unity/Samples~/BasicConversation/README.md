# Basic Conversation Sample

This sample demonstrates a minimal NPC conversation setup.

## Setup

1. Open `SampleScene` (or create a new scene)
2. Create an empty GameObject, add `InsimulManager`, configure server URL + world ID
3. Create a Cube NPC, add `InsimulNPC` + `InsimulAudioPlayer` components, set Character ID
4. Create a UI InputField + Button, wire Button.onClick to call `InsimulNPC.SendText()`
5. Create a UI Text element, wire `InsimulNPC.onTextReceived` to update it

See the main README for full integration details.
