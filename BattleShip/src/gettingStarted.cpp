#define OLC_PGE_APPLICATION
#include "olcPixelGameEngine.h"

#include "olc_net.h"

#define ROT_IN_RADS 1.5707963267948f
#define PIXEL_WIDTH 15

////////////////////////
enum GameMessage : uint8_t
{
    ServerAccept,
    ServerDeny,
    ServerPing,
    MessageAll,
    MessageToServer,
    MessageFromServer,
    FireMissile,
    Reply
};

class CustomClient : public olc::net::client_interface<GameMessage>
{
public:

    //void MessageAll()
    //{
    //	olc::net::message<GameMessage> msg;
    //	msg.header.id = GameMessage::MessageAll;
    //	Send(msg);
    //}

};

class CustomServer : public olc::net::server_interface<GameMessage>
{
public:
    CustomServer(uint16_t nPort) : olc::net::server_interface<GameMessage>(nPort)
    {

    }

    std::vector<olc::net::message<GameMessage>> messagesIn;

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
            std::cout << "[" << client->GetID() << "]: Message reply from client\n";
            messagesIn.push_back(msg);

            // Construct a new message and send it to all clients
            //olc::net::message<GameMessage> msg;
            //msg.header.id = GameMessage::MessageFromServer;
            //msg << client->GetID();
            //MessageClient(client, msg);

        }
        break;

        case GameMessage::FireMissile:
        {
            olc::net::message<GameMessage> msg;
            msg.header.id = GameMessage::FireMissile;
            msg << client->GetID();
            MessageClient(client, msg);

            // Simply bounce message back to client
            //client->Send(msg);
        }
        break;
        }
    }
};

/////////////////////////



enum GamePiece
{
   blank,
   bomb,
   boat,
   submarine,
   destroyer,
   carrier,
   miss,
   hit
};

static char GetGamePieceChar(GamePiece p)
{
   switch (p)
   {
   case 0:
      return '_';
   case 1:
      return '*';
   case 2:
      return 'B';
   case 3:
      return 'S';
   case 4:
      return 'D';
   case 5:
      return 'C';
   default:
      return 'X';
   }
}

enum Heading {North = 0, East = 1};
enum Player {me = 0, enemy = 1};

class GameBoard
{
public:
   GameBoard()
   {
      int t = 48;
      for (int i = 0; i < height; ++i)
         for (int j = 0; j < width; ++j)
            board[i][j] = GamePiece::blank;
   }

   bool IsWithinBounds(GamePiece piece, Heading head, olc::vi2d loc)
   {
      int size = 1;
      if (piece != bomb)
          size = (int)piece;

      if (loc.x >= width || loc.y >= height || loc.x < 0 || loc.y < 0)
         return false;

      if (head == Heading::East && (loc.x + size - 1) >= width)
         return false;

      if (head == Heading::North && (loc.y + size - 1) >= height)
         return false;

      return true;
   }

   bool IsValidLocation(GamePiece piece, Heading head, olc::vi2d loc)
   {
      if (!IsWithinBounds(piece, head, loc))
         return false;

      for (int i = 0; i < piece; ++i)
      {
         if (board[loc.y][loc.x] != GamePiece::blank)
            return false;
         if (head == Heading::North)
            loc.y++;
         else
            loc.x++;
      }
      return true;
   }

   bool PlacePiece(GamePiece piece, Heading head, olc::vi2d ind)
   {
      if (!IsValidLocation(piece, head, ind))
         return false;

      for (int i = 0; i < piece; ++i)
      {
         board[ind.y][ind.x] = piece;

         if (head == Heading::North)
            ind.y++;
         else
            ind.x++;
      }
      return true;
   }

   GamePiece GetPiece(int x, int y)
   {
      return board[y][x];
   }

   void PrintBoard()
   {
      for (int i = 0; i < height; ++i)
      {
         for (int j = 0; j < width; ++j)
         {
            std::cout << GetGamePieceChar(board[i][j]) << " ";
         }
         std::cout << "\n";
      }
      std::cout << "\n";
   }

private:
   const int width = 10;
   const int height = 10;
   std::array<std::array<GamePiece, 10>, 10> board;
};

class Ship
{
public:
   Ship(GamePiece p, const std::string& spriteLoc, olc::vi2d pos = {0,0}) :
      piece(p),
      sprite(std::unique_ptr<olc::Sprite>(new olc::Sprite(spriteLoc))),
      pos(pos)
   {
      decal = std::unique_ptr<olc::Decal>(new olc::Decal(sprite.get()));
      center = olc::vi2d(sprite->width / 2, sprite->height / 2);
   }
   bool IsSunk() const
   {
      bool sunk = false;
      for (auto& i : isHitAtIndex)
         sunk &= i;
      return sunk;
   }

   bool IsRotated() const
   {
      if (this->heading == Heading::North)
         return false;
      else
         return true;
   }

   GamePiece piece;
   bool isPositioned = false;
   std::array<bool, 2> isHitAtIndex = { false };
   olc::vi2d pos{ 0, 0 };
   Heading heading = Heading::North;

   std::unique_ptr<olc::Sprite> sprite = nullptr;
   std::unique_ptr<olc::Decal> decal = nullptr;
   olc::vi2d center;
};



class BattleShip : public olc::PixelGameEngine
{
public:
   BattleShip()
   {
      sAppName = "BattleShip";
   }

   std::vector<Ship> playerPieces;
   std::vector<Ship> shots;
   GameBoard myGameboard;
   GameBoard enemyGameboard;
   std::vector<olc::net::message<GameMessage>> messagesIn;
   std::vector<olc::net::message<GameMessage>> messagesOut;
   bool keepRunning = true;
   std::thread gameConnectThread;

public:
   bool OnUserCreate() override
   {
       Ship boat(GamePiece::boat, "../resources/boat.png");
       Ship sub(GamePiece::submarine, "../resources/submarine.png");
       Ship destroyer(GamePiece::destroyer, "../resources/destroyer.png");
       Ship carrier(GamePiece::carrier, "../resources/carrier.png");
       playerPieces.push_back(std::move(boat));
       playerPieces.push_back(std::move(sub));
       playerPieces.push_back(std::move(destroyer));
       playerPieces.push_back(std::move(carrier));
   
       Ship bomb(GamePiece::bomb, "../resources/bomb.png");
       shots.push_back(std::move(bomb));

       auto writeFunction = [this]()
       {
           CustomServer server(6767);
           server.Start();
           while (keepRunning)
           {
               server.Update(-1, false);
               if (!messagesOut.empty())
               {
                   server.MessageAllClients(messagesOut.back());
                   messagesOut.pop_back();
               }
               if (!server.messagesIn.empty())
               {
                   messagesIn.push_back(server.messagesIn.back());
                   server.messagesIn.pop_back();
               }
                   
           }
           std::cout << "closing thread....\n";
       };

       gameConnectThread = std::thread(writeFunction);

       return true;
   }

   void DrawGrid()
   {
      // Erase previous frame
      Clear(olc::BLUE);
      int w = ScreenWidth();
      int h = ScreenHeight();
      int iw = w / 10;
      int ih = h / 20;

      // Draw grid
      for (auto i = 1; i < 20; ++i)
      {
         auto p = olc::WHITE;
         if (i == 10)
            p = olc::DARK_RED;
         DrawLine(i * iw, 0, i * iw, h, p);
         DrawLine(0, i * ih, w, i * ih, p);
      }
   }

   Ship FireMissile(const olc::vi2d loc)
   {
       std::string input = "f" + std::to_string(loc.x) + std::to_string(loc.y);

       olc::net::message<GameMessage> msg_out;
       msg_out.header.id = GameMessage::MessageFromServer;
       for (const auto& d : input)
           msg_out << d; 

       messagesOut.push_back(msg_out);
   }

   bool FireMissleAtEnemy(olc::vi2d loc)
   {
       olc::net::message<GameMessage> msg_out;
       msg_out.header.id = GameMessage::FireMissile;
       std::string mslLoc = std::to_string(loc.x) + std::to_string(loc.y);
       for (const auto& d : mslLoc)
           msg_out << d;
       messagesOut.push_back(msg_out);

       while (messagesIn.empty());

       auto msg = messagesIn.back();
       messagesIn.pop_back();
       std::string reply;
       for (auto& s : msg.body)
           reply += s;

       if (reply == "hit")
           return true;
       else
           return false;
   }

   std::tuple<olc::vi2d, bool> KeyPressHandler(Ship& ship, int& index, GameBoard& gameboard)
   {
       static olc::vi2d pos(0, 0);
       static bool drawRotated = false;

       if (GetKey(olc::Key::RIGHT).bPressed)
          if (gameboard.IsWithinBounds(ship.piece, ship.heading, {pos.x + 1, pos.y}))
            pos.x += 1;
           
       if (GetKey(olc::Key::LEFT).bPressed)
          if (gameboard.IsWithinBounds(ship.piece, ship.heading, { pos.x - 1, pos.y }))
            pos.x += -1;

       if (GetKey(olc::Key::UP).bPressed)
          if (gameboard.IsWithinBounds(ship.piece, ship.heading, { pos.x, pos.y - 1}))
            pos.y += -1;

       if (GetKey(olc::Key::DOWN).bPressed)
          if (gameboard.IsWithinBounds(ship.piece, ship.heading, { pos.x, pos.y + 1 }))
            pos.y += 1;

       if (GetKey(olc::Key::M).bPressed)
       {
           bool hit = FireMissleAtEnemy(pos);
           if (hit)
           {
               Ship hit(GamePiece::hit, "../resources/hit.png", pos);
               shots.push_back(std::move(hit));
           }
           else
           {
               Ship miss(GamePiece::miss, "../resources/miss.png", pos);
               shots.push_back(std::move(miss));
           }
           Ship bomb(GamePiece::bomb, "../resources/bomb.png");
           shots.push_back(std::move(bomb));
       }

       if (GetKey(olc::Key::ENTER).bPressed && gameboard.IsValidLocation(ship.piece, ship.heading, pos))
       {
           gameboard.PlacePiece(ship.piece, ship.heading, pos);
           ship.isPositioned = true;
           ++index;
           drawRotated = false;
           pos = olc::vi2d(0, 0);
           gameboard.PrintBoard();
       }

       if (GetKey(olc::Key::R).bPressed)
       {
           drawRotated = !drawRotated;
           ship.heading = (Heading)((int)drawRotated);
       }

       return std::tuple<olc::vi2d, bool>(pos, drawRotated);
   }

    olc::vi2d IndexToPixelLoc(const olc::vi2d ind, const Ship& piece, Player player) const
    {
        olc::vi2d offset;
        if (piece.IsRotated() && player == Player::me)
            offset = { ind.x * PIXEL_WIDTH + piece.center.y, ind.y * PIXEL_WIDTH + piece.center.x + ScreenHeight() / 2 };
        else if (player == Player::me)
            offset = { ind.x * PIXEL_WIDTH, ind.y * PIXEL_WIDTH + ScreenHeight() / 2 };
        else
            offset = { ind.x * PIXEL_WIDTH, ind.y * PIXEL_WIDTH };
        return offset;
    }

    void DrawGamePieces()
    {
       Clear(olc::VERY_DARK_BLUE);
       for (auto& piece : playerPieces)
       {
          if (!piece.isPositioned)
             continue;

          auto loc = IndexToPixelLoc(piece.pos, piece, Player::me);
          if (piece.IsRotated())
             DrawRotatedDecal(loc, piece.decal.get(), ROT_IN_RADS, piece.center);
          else
             DrawDecal(loc, piece.decal.get());
       }

       static int pieceIndex = 0;

       if (pieceIndex < playerPieces.size())
       {
          auto [pos, drawRotated] = KeyPressHandler(playerPieces[pieceIndex], pieceIndex, myGameboard);
          if (pieceIndex < playerPieces.size())
          {
             playerPieces[pieceIndex].pos = pos;
             auto loc = IndexToPixelLoc(playerPieces[pieceIndex].pos, playerPieces[pieceIndex], Player::me);
             if (drawRotated)
                DrawRotatedDecal(loc, playerPieces[pieceIndex].decal.get(), ROT_IN_RADS, playerPieces[pieceIndex].center);
             else
                DrawDecal(loc, playerPieces[pieceIndex].decal.get());
          }
       }
       
       if (pieceIndex >= playerPieces.size())
       {

           auto [pos, drawRotated] = KeyPressHandler(shots.back(), pieceIndex, enemyGameboard);
           shots.back().pos = pos;
           auto loc = IndexToPixelLoc(shots.back().pos, shots.back(), Player::enemy);
           DrawDecal(loc, shots.back().decal.get());
       }

    }

   bool OnUserUpdate(float fElapsedTime) override
   {
      DrawGamePieces();
      DrawGrid();

      return true;
   }

   bool OnUserDestroy()
   {
       keepRunning = false;
       gameConnectThread.join();
       return true;
   }

};



//int WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nShowCmd)
int main()
{
   BattleShip bs;
   if (bs.Construct(150, 300, 2, 2))
       bs.Start();


   return 0;
}
