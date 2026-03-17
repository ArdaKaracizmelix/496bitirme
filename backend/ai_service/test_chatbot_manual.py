from ai_service.services.chat_session import ChatSession


def main():
    chat = ChatSession(user_id="cem")

    while True:
        message = input("You: ")

        if message.lower() in ["exit", "quit"]:
            break

        result = chat.process_message(message)

        print("\nIntent:", result["intent"])
        print("Bot:", result["response"])
        print()


if __name__ == "__main__":
    main()