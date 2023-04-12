#define OLC_PGE_APPLICATION
#include "olcPixelGameEngine.h"
#include "olc_net.h"


#define BOAT_LOC      "../resources/boat.png"
#define SUB_LOC       "../resources/submarine.png"
#define DESTROYER_LOC "../resources/destroyer.png"
#define CARRIER_LOC   "../resources/carrier.png"
#define BOMB_LOC      "../resources/bomb.png"
#define MISS_LOC      "../resources/miss.png"
#define HIT_LOC       "../resources/hit.png"

#define ROT_IN_RADS   1.5707963267948f
#define PIXEL_WIDTH   15



enum GamePiece
{
   blank = 0,
   bomb = 1,
   miss = 1,
   hit = 1,
   boat = 2,
   submarine = 3,
   destroyer = 4,
   carrier = 5
};
enum Heading { North = 0, East = 1 };
enum Player { me = 0, enemy = 1 };

class Piece
{
public:
   Piece(const GamePiece gamepiece, const std::string& spriteLoc) :
      piece(gamepiece),
      sprite(std::unique_ptr<olc::Sprite>(new olc::Sprite(spriteLoc))),
      pos(pos)
   {
      this->decal = std::unique_ptr<olc::Decal>(new olc::Decal(sprite.get()));
   }

   Piece(GamePiece gamepiece, const std::string& spriteLoc, olc::vi2d pos, Player player = Player::me) :
      piece(gamepiece),
      sprite(std::unique_ptr<olc::Sprite>(new olc::Sprite(spriteLoc))),
      pos(pos),
      player(player)
   {
      this->decal = std::unique_ptr<olc::Decal>(new olc::Decal(sprite.get()));
   }

   GamePiece GetGamePiece() const { return piece; }
   int GetSize() const { return (int)piece; }
   olc::vi2d GetPosition() const { return pos; }
   void SetPosition(const olc::vi2d pos) { this->pos = pos; }
   Heading GetHeading() const { return heading; }
   void SetHeading(const Heading heading) { this->heading = heading; };
   olc::Decal* GetDecal() const { return decal.get(); }
   olc::Sprite* GetSprite() const { return sprite.get(); }
   Player GetPlayer() const { return player; }
   bool IsSunk() const
   {
      if (hitCount >= GetSize())
         return true;
      else
         return false;
   }

   GamePiece piece;
   bool Positioned = false;
   int hitCount = 0;
   olc::vi2d pos{ 0,0 };
   Player player = Player::me;
   Heading heading = Heading::North;
   std::unique_ptr<olc::Sprite> sprite = nullptr;
   std::unique_ptr<olc::Decal> decal = nullptr;
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

class GameBoard
{
public:
   GameBoard()
   {
      int t = 48;
      for (int i = 0; i < height; ++i)
      {
         for (int j = 0; j < width; ++j)
         {
            board[i][j] = GamePiece::blank;
            ptrBoard[i][j] = nullptr;
         }
      }
   }

   bool IsWithinBounds(GamePiece piece, Heading head, olc::vi2d loc)
   {
      if (loc.x >= width || loc.y >= height || loc.x < 0 || loc.y < 0)
         return false;

      if (head == Heading::East && (loc.x + (int)piece - 1) >= width)
         return false;

      if (head == Heading::North && (loc.y + (int)piece - 1) >= height)
         return false;

      return true;
   }

   bool IsValidLocation(GamePiece piece, Heading head, olc::vi2d loc)
   {
      if (!IsWithinBounds(piece, head, loc))
         return false;

      for (int i = 0; i < (int)piece; ++i)
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

   bool PlacePiece(GamePiece piece, Heading head, olc::vi2d ind, std::shared_ptr<Piece>& piecePtr)
   {
      if (!IsValidLocation(piece, head, ind))
         return false;

      for (int i = 0; i < (int)piece; ++i)
      {
         board[ind.y][ind.x] = piece;
         ptrBoard[ind.y][ind.x] = piecePtr;

         if (head == Heading::North)
            ind.y++;
         else
            ind.x++;
      }
      return true;
   }

   GamePiece GetPiece(const olc::vi2d loc) const
   {
      return board[loc.y][loc.x];
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

   std::shared_ptr<Piece> GetPtrPiece(const olc::vi2d loc) const
   {
      return ptrBoard[loc.y][loc.x];
   }

private:
   const int width = 10;
   const int height = 10;
   std::array<std::array<GamePiece, 10>, 10> board;
   std::array<std::array<std::shared_ptr<Piece>, 10>, 10> ptrBoard;
};

static void DrawPiece(olc::PixelGameEngine* pge, Piece* piece)
{
   olc::vi2d offset;
   auto center = olc::vi2d(piece->GetSprite()->width / 2, piece->GetSprite()->height / 2);
   auto ind = piece->GetPosition();

   if (piece->GetHeading() == Heading::East && piece->GetPlayer() == Player::me)
      offset = { ind.x * PIXEL_WIDTH + center.y, ind.y * PIXEL_WIDTH + center.x + pge->ScreenHeight() / 2 };
   else if (piece->GetPlayer() == Player::me)
      offset = { ind.x * PIXEL_WIDTH, ind.y * PIXEL_WIDTH + pge->ScreenHeight() / 2 };
   else
      offset = { ind.x * PIXEL_WIDTH, ind.y * PIXEL_WIDTH };

   if (piece->GetHeading() == Heading::North)
      pge->DrawDecal(offset, piece->GetDecal());
   else
      pge->DrawRotatedDecal(offset, piece->GetDecal(), ROT_IN_RADS, center);
}

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


class BattleShip : public olc::PixelGameEngine
{
public:
   BattleShip()
   {
      sAppName = "BattleShip";
   }
   // game stuff
   std::unique_ptr<olc::Sprite> background = nullptr;
   std::vector<std::shared_ptr<Piece>> gamePieces;
   bool incomingMissile = false;
   olc::vi2d incomingMissilePos{ 0,0 };
   GameBoard myGameboard;
   GameBoard enemyGameboard;

   //thread stuff
   std::mutex mutex;
   bool keepRunning = true;
   std::thread gameConnectThread;

   // client and server stuff
   CustomServer server = CustomServer(6767);
   CustomClient client = CustomClient();
   std::vector<olc::net::message<GameMessage>> messagesIn;
   std::vector<olc::net::message<GameMessage>> messagesOut;

public:
   bool OnUserCreate() override
   {
      auto boat = std::shared_ptr<Piece>(new Piece(GamePiece::boat, BOAT_LOC));
      gamePieces.push_back(boat);

      background = std::unique_ptr<olc::Sprite>(new olc::Sprite("../resources/background.png"));


      bool amClient = false;
      auto start = std::chrono::steady_clock::now();
      constexpr std::chrono::duration<int> timeOut = std::chrono::seconds(3);

      // try and connect with server as a client first
      std::cout << "trying to connect to a server first...\n";
      while (std::chrono::steady_clock::now() - start < timeOut)
      {
         client.Connect("127.0.0.1", 6767);
         if (client.IsConnected())
         {
            amClient = true;
            break;
         }
      }

      auto RunGameServer = [this]()
      {
         std::cout << "couldn't find server, starting our own.\n";
         server.Start();
         auto lock = std::unique_lock(mutex, std::defer_lock);

         auto hitCallback = [this](olc::vi2d loc)
         {
            this->incomingMissile = true;
            this->incomingMissilePos = loc;
            if (myGameboard.GetPiece(loc) == GamePiece::blank)
               return false;
            else
               return true;
         };

         server.missileFired_callback = hitCallback;

         while (keepRunning)
         {
            server.Update(-1, false);
            lock.lock();
            if (!messagesOut.empty())
            {
               server.MessageAllClients(messagesOut.back());
               messagesOut.pop_back();
            }
            lock.unlock();
            if (!server.messagesIn.empty())
            {
               std::cout << "received message from enemey...\n";
               messagesIn.push_back(server.messagesIn.back());
               server.messagesIn.pop_back();
            }

         }
         std::cout << "closing game server....\n";
      };

      auto RunGameClient = [this]()
      {
         while (keepRunning)
         {
            if (client.IsConnected())
            {
               if (!client.Incoming().empty())
               {
                  auto msg = client.Incoming().pop_front().msg;

                  switch (msg.header.id)
                  {
                  case GameMessage::FireMissile:
                  {

                     std::cout << "incoming missle from opponent....\n";
                     int x, y;
                     msg >> y;
                     msg >> x;
                     std::cout << "location of missile: (" << x << "," << y << ")\n";
                     olc::net::message<GameMessage> msgOut;
                     msgOut.header.id = GameMessage::Reply;
                     static bool toggle = false;
                     std::string str = "hit";
                     if (toggle)
                        str = "miss";
                     toggle = !toggle;
                     for (const auto& d : str)
                        msgOut << d;
                     client.Send(msgOut);
                  }
                  break;

                  case GameMessage::PieceSunk:
                  {
                     std::cout << "You sunk a ";
                     GamePiece p;
                     msg >> p;
                     if (p == GamePiece::boat)
                        std::cout << "boat!\n";
                     if (p == GamePiece::submarine)
                        std::cout << "submarine!\n";
                     if (p == GamePiece::destroyer)
                        std::cout << "destroyer!\n";
                     if (p == GamePiece::carrier)
                        std::cout << "carrier!\n";
                  }
                  break;

                  case GameMessage::GameLoss:
                  {
                     std::cout << "Congratulations you Won!!!\n";
                  }
                  break;

                  case GameMessage::Reply:
                  {
                     std::cout << "reply from oponent was: ";
                     for (const auto& d : msg.body)
                        std::cout << d;
                     std::cout << "\n";
                  }
                  break;

                  }
               }

               std::string input;
               std::getline(std::cin, input);
               //static int x = 0;
               //static int y = 0;
               olc::net::message<GameMessage> msg_out;
               msg_out.header.id = GameMessage::FireMissile;

               int x = atoi(input.c_str());
               std::getline(std::cin, input);
               int y = atoi(input.c_str());
               msg_out << x;
               msg_out << y;
               client.Send(msg_out);

            }
            else
            {
               std::cout << "Server Down\n";
               keepRunning = false;
            }
         }
      };

      // start client or server
      if (amClient)
         gameConnectThread = std::thread(RunGameClient);
      else
         gameConnectThread = std::thread(RunGameServer);


      return true;
   }

   bool IncomingMissileCheck(const olc::vi2d loc)
   {
      if (myGameboard.GetPiece(loc) == GamePiece::blank)
      {
         auto miss = std::shared_ptr<Piece>(new Piece(GamePiece::miss, MISS_LOC, loc, Player::me));
         gamePieces.push_back(miss);
         gamePieces.back()->Positioned = true;
         myGameboard.PlacePiece(GamePiece::miss, Heading::North, loc, miss);
         return false;
      }
      else
      {
         auto hit = std::shared_ptr<Piece>(new Piece(GamePiece::hit, HIT_LOC, loc, Player::me));
         gamePieces.push_back(hit);
         gamePieces.back()->Positioned = true;
         myGameboard.PlacePiece(GamePiece::hit, Heading::North, loc, hit);
         return true;
      }
   }

   void SendGameLoss()
   {
      olc::net::message<GameMessage> msg_out;
      msg_out.header.id = GameMessage::GameLoss;
      msg_out << false;
      auto lock = std::unique_lock(mutex);
      messagesOut.push_back(msg_out);
      lock.unlock();
   }

   void SendPieceSunk(const GamePiece piece)
   {
      olc::net::message<GameMessage> msg_out;
      msg_out.header.id = GameMessage::PieceSunk;
      msg_out << piece;
      auto lock = std::unique_lock(mutex);
      messagesOut.push_back(msg_out);
      lock.unlock();
   }

   bool FireMissleAtEnemy(olc::vi2d loc)
   {
      olc::net::message<GameMessage> msg_out;
      msg_out.header.id = GameMessage::FireMissile;
      msg_out << loc.x;
      msg_out << loc.y;
      auto lock = std::unique_lock(mutex);
      messagesOut.push_back(msg_out);
      lock.unlock();

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

   bool KeyPressHandler(std::shared_ptr<Piece>& piece, GameBoard& gameboard)
   {
      if (piece->Positioned)
         return false;

      static olc::vi2d pos(0, 0);
      static bool drawRotated = false;

      if (GetKey(olc::Key::RIGHT).bPressed)
         if (gameboard.IsWithinBounds(piece->GetGamePiece(), piece->GetHeading(), { pos.x + 1, pos.y }))
            pos.x += 1;

      if (GetKey(olc::Key::LEFT).bPressed)
         if (gameboard.IsWithinBounds(piece->GetGamePiece(), piece->GetHeading(), { pos.x - 1, pos.y }))
            pos.x += -1;

      if (GetKey(olc::Key::UP).bPressed)
         if (gameboard.IsWithinBounds(piece->GetGamePiece(), piece->GetHeading(), { pos.x, pos.y - 1 }))
            pos.y += -1;

      if (GetKey(olc::Key::DOWN).bPressed)
         if (gameboard.IsWithinBounds(piece->GetGamePiece(), piece->GetHeading(), { pos.x, pos.y + 1 }))
            pos.y += 1;

      if (GetKey(olc::Key::M).bPressed)
      {
         if (gameboard.GetPiece(pos) != GamePiece::blank)
            return false;

         bool hit = FireMissleAtEnemy(pos);
         if (hit)
         {
            auto hit = std::shared_ptr<Piece>(new Piece(GamePiece::hit, HIT_LOC, pos, Player::me));
            gamePieces.push_back(hit);
            gamePieces.back()->Positioned = true;
            gameboard.PlacePiece(GamePiece::hit, Heading::North, pos, hit);
         }
         else
         {
            auto miss = std::shared_ptr<Piece>(new Piece(GamePiece::miss, MISS_LOC, pos, Player::me));
            gamePieces.push_back(miss);
            gamePieces.back()->Positioned = true;
            gameboard.PlacePiece(GamePiece::miss, Heading::North, pos, miss);
         }

         drawRotated = false;
         pos = olc::vi2d(0, 0);
         gameboard.PrintBoard();
         return true;
      }

      if (GetKey(olc::Key::ENTER).bPressed && gameboard.IsValidLocation(piece->GetGamePiece(), piece->GetHeading(), pos))
      {
         static int index = 0;
         if (index < 4)
         {
            gameboard.PlacePiece(piece->GetGamePiece(), piece->GetHeading(), pos, gamePieces[index]);
            piece->Positioned = true;
            ++index;
         }
         if (index == 1)
            gamePieces.push_back(std::shared_ptr<Piece>(new Piece(GamePiece::submarine, SUB_LOC)));
         else if (index == 2)
            gamePieces.push_back(std::shared_ptr<Piece>(new Piece(GamePiece::destroyer, DESTROYER_LOC)));
         else if (index == 3)
            gamePieces.push_back(std::shared_ptr<Piece>(new Piece(GamePiece::carrier, CARRIER_LOC)));
         if (index == 4)
            gamePieces.push_back(std::shared_ptr<Piece>(new Piece(GamePiece::bomb, BOMB_LOC, pos, Player::enemy)));

         drawRotated = false;
         pos = olc::vi2d(0, 0);
         gameboard.PrintBoard();
         return true;
      }

      if (GetKey(olc::Key::R).bPressed)
      {
         drawRotated = !drawRotated;
         piece->SetHeading((Heading)((int)drawRotated));
         if (drawRotated) // check for edge rotation
         {
            if (pos.x + (int)piece->GetGamePiece() >= 10)
               pos.x = pos.x - (int)piece->GetGamePiece() + 1;
            if (pos.y + (int)piece->GetGamePiece() >= 10)
               pos.y = pos.y - (int)piece->GetGamePiece() + 1;
         }
      }

      piece->SetPosition(pos);
      return false;
   }

   void CheckForIncomingMissiles()
   {
      if (!this->incomingMissile)
         return;

      if (myGameboard.GetPiece(this->incomingMissilePos) == GamePiece::blank)
      {
         auto miss = std::shared_ptr<Piece>(new Piece(GamePiece::miss, MISS_LOC, this->incomingMissilePos));
         gamePieces.push_back(miss);
         gamePieces.back()->Positioned = true;
         myGameboard.PlacePiece(GamePiece::miss, Heading::North, this->incomingMissilePos, miss);
      }
      else
      {
         auto hit = std::shared_ptr<Piece>(new Piece(GamePiece::hit, HIT_LOC, this->incomingMissilePos));
         gamePieces.push_back(hit);
         gamePieces.back()->Positioned = true;
         myGameboard.PlacePiece(GamePiece::hit, Heading::North, this->incomingMissilePos, hit);
         auto p = myGameboard.GetPtrPiece(this->incomingMissilePos);
         p->hitCount++;
         if (p->IsSunk())
            SendPieceSunk(p->GetGamePiece());
      }
      this->incomingMissile = false;
   }

   void DrawGamePieces()
   {
      bool pieceAdded = false;
      for (auto& piece : gamePieces)
      {
         if (piece->GetPlayer() == Player::me)
            pieceAdded = KeyPressHandler(piece, myGameboard);
         else
            pieceAdded = KeyPressHandler(piece, enemyGameboard);
         if (pieceAdded)
            break;
         DrawPiece(this, piece.get());
      }
   }

   bool CheckForLoss()
   {
      int pieceCount = 4;
      for (auto& piece : gamePieces)
      {
         if (piece->IsSunk())
         {
            pieceCount--;
         }
      }

      if (pieceCount == 0)
      {
         SendGameLoss();
         return true;
      }
      return false;
   }

   void DrawBackground()
   {
      DrawSprite({ 0,0 }, background.get());
   }

   bool OnUserUpdate(float fElapsedTime) override
   {
      DrawBackground();
      CheckForIncomingMissiles();
      DrawGamePieces();
      CheckForLoss();

      return true;
   }

   bool OnUserDestroy()
   {
      keepRunning = false;
      gameConnectThread.join();

      std::cout << "successful deletion\n";
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
