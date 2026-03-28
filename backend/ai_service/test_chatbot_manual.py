from ai_service.services.chat_session import ChatSession

def main():
    chat = ChatSession(user_id="test-user")

    while True:
        message = input("You: ")

        if message.lower() in ["exit", "quit", "q"]:
            print("Çıkılıyor...")
            break

        try:
            result = chat.process_message(message)
            print("Bot:", result["response"])
            print("Intent:", result["intent"])
            print("-" * 50)
        except Exception as e:
            print("Hata oluştu:", str(e))

if __name__ == "__main__":
    main()