#pragma once
#include "olcPixelGameEngine.h"
#include "olc_net.h"
#include "GamePieces.h"

enum GameMessage : uint8_t
{
    ServerAccept,
    ServerDeny,
    ServerPing,
    MessageAll,
    MessageToServer,
    MessageFromServer,
    FireMissile,
    Reply,
    PieceSunk,
    GameLoss
};

using MessageCallback = std::function<bool(olc::vi2d loc)>;

class CustomClient : public olc::net::client_interface<GameMessage>
{
public:
};


class CustomServer : public olc::net::server_interface<GameMessage>
{
public:
    CustomServer(uint16_t nPort) : olc::net::server_interface<GameMessage>(nPort) {}

    std::vector<olc::net::message<GameMessage>> messagesIn;
    MessageCallback missileFired_callback = nullptr;

protected:
    virtual bool OnClientConnect(std::shared_ptr<olc::net::connection<GameMessage>> client)
    {
        olc::net::message<GameMessage> msg;
        msg.header.id = GameMessage::ServerAccept;
        client->Send(msg);
        return true;
    }

    // Called when a client appears to have disconnected
    virtual void OnClientDisconnect(std::shared_ptr<olc::net::connection<GameMessage>> client)
    {
        std::cout << "Removing client [" << client->GetID() << "]\n";
    }

    // Called when a message arrives
    virtual void OnMessage(std::shared_ptr<olc::net::connection<GameMessage>> client, olc::net::message<GameMessage>& msg)
    {
        switch (msg.header.id)
        {
        case GameMessage::ServerPing:
        {
            std::cout << "[" << client->GetID() << "]: Server Ping\n";

            // Simply bounce message back to client
            client->Send(msg);
        }
        break;

        case GameMessage::MessageToServer:
        {
            //std::string in(msg.header.size, '\n');
            //msg >> in;
            std::string str;
            for (auto& l : msg.body)
                str += l;
            std::cout << "[" << client->GetID() << "]: Incoming Message\n" << str << "\n\n";
        }
        break;

        case GameMessage::MessageFromServer:
        {
            std::cout << "[" << client->GetID() << "]: Message All\n";

            // Construct a new message and send it to all clients
            olc::net::message<GameMessage> msg;
            msg.header.id = GameMessage::MessageFromServer;
            msg << client->GetID();
            MessageClient(client, msg);

        }
        break;

        case GameMessage::Reply:
        {
            std::cout << "received reply from enemy...\n";
            messagesIn.push_back(msg);

        }
        break;

        case GameMessage::PieceSunk:
        {
            std::cout << "sending ...\n";
            messagesIn.push_back(msg);

        }
        break;

        case GameMessage::FireMissile:
        {
            std::cout << "incoming missile from enemy...\n";
            int x, y;
            msg >> y >> x;
            bool hit = missileFired_callback({ x,y });

            olc::net::message<GameMessage> msgReply;
            msgReply.header.id = GameMessage::Reply;
            msgReply << client->GetID();

            std::string str;

            if (hit)
                str = "hit";
            else
                str = "miss";

            for (const auto& d : str)
                msgReply << d;

            MessageClient(client, msgReply);
            std::cout << "missile was a " << str << " at location " << x << "," << y << "\n";
        }
        break;
        }
    }
};