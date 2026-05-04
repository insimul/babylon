#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "AmbientConversationSystem.generated.h"

/**
 * Ambient NPC conversation subsystem.
 * Manages spontaneous conversations between nearby NPCs, handling partner
 * selection, conversation lifecycle, and event broadcasting.
 */
USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FConversationPair
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Conversation")
    FString NPC_A_Id;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Conversation")
    FString NPC_B_Id;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Conversation")
    float StartTime = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Conversation")
    float Duration = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Conversation")
    FString Topic;

    /** Unique conversation ID */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Conversation")
    int32 ConversationId = 0;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnConversationStarted, const FConversationPair&, Conversation);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnConversationEnded, const FConversationPair&, Conversation);

UCLASS()
class INSIMULEXPORT_API UAmbientConversationSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Start a conversation between two NPCs */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Conversation")
    int32 StartConversation(const FString& NPC_A, const FString& NPC_B);

    /** End a conversation by ID */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Conversation")
    void EndConversation(int32 ConversationId);

    /** Update all active conversations (call each tick or on a timer) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Conversation")
    void UpdateConversations(float DeltaTime);

    /** Get all currently active conversations */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Conversation")
    TArray<FConversationPair> GetActiveConversations() const;

    /** Automatically find eligible conversation partners among registered NPCs */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Conversation")
    void FindConversationPartners();

    /** Register an NPC for ambient conversations */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Conversation")
    void RegisterNPC(const FString& CharacterId, AActor* NPCActor);

    /** Unregister an NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Conversation")
    void UnregisterNPC(const FString& CharacterId);

    /** Maximum number of simultaneous conversations */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Conversation")
    int32 MaxSimultaneousConversations = 3;

    /** Range within which NPCs can start a conversation (cm) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Conversation")
    float ConversationRange = 200.0f;

    /** Minimum time between conversations for the same NPC (seconds) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Conversation")
    float MinTimeBetweenConversations = 60.0f;

    /** Default conversation duration (seconds) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Conversation")
    float DefaultConversationDuration = 15.0f;

    /** Fired when a new conversation starts */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Conversation")
    FOnConversationStarted OnConversationStarted;

    /** Fired when a conversation ends */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Conversation")
    FOnConversationEnded OnConversationEnded;

private:
    /** Active conversations */
    TArray<FConversationPair> ActiveConversations;

    /** Registered NPC actors */
    TMap<FString, AActor*> RegisteredNPCs;

    /** Last conversation end time per NPC */
    TMap<FString, float> LastConversationEndTime;

    /** Elapsed game time tracker */
    float ElapsedTime = 0.0f;

    /** Next conversation ID counter */
    int32 NextConversationId = 1;

    /** Check if an NPC is currently in a conversation */
    bool IsInConversation(const FString& CharacterId) const;

    /** Check if an NPC is eligible for a new conversation */
    bool IsEligible(const FString& CharacterId) const;

    /** Available conversation topics */
    TArray<FString> ConversationTopics;
};
