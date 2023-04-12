#define OLC_PGE_APPLICATION
#include "olcPixelGameEngine.h"
#include "GamePieces.h"
#include "BattleshipServerClient.h"
#include "GameBoard.h"

#define BOAT_LOC      "../resources/boat.png"
#define SUB_LOC       "../resources/submarine.png"
#define DESTROYER_LOC "../resources/destroyer.png"
#define CARRIER_LOC   "../resources/carrier.png"
#define BOMB_LOC      "../resources/bomb.png"
#define MISS_LOC      "../resources/miss.png"
#define HIT_LOC       "../resources/hit.png"


class BattleShip : public olc::PixelGameEngine
{
public:
   BattleShip()
   {
      sAppName = "BattleShip";
   }

   std::vector<std::shared_ptr<Piece>> gamePieces;
   bool incomingMissile = false;
   olc::vi2d incomingMissilePos{ 0,0 };
   
   GameBoard myGameboard;
   GameBoard enemyGameboard;
   std::vector<olc::net::message<GameMessage>> messagesIn;
   std::vector<olc::net::message<GameMessage>> messagesOut;
   std::mutex mutex;
   bool keepRunning = true;
   std::thread gameConnectThread;

   std::unique_ptr<olc::Sprite> background = nullptr;

public:
   bool OnUserCreate() override
   {
       auto boat = std::shared_ptr<Piece>(new Piece(GamePiece::boat, BOAT_LOC));
       gamePieces.push_back(boat);
       
       background = std::unique_ptr<olc::Sprite>(new olc::Sprite("../resources/background.png"));

       auto GameServer = [this]()
       {
           CustomServer server(6767);
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
           std::cout << "closing thread....\n";
       };

       auto GameClient = [this]()
       {
           bool bQuit = false;
           while (!bQuit)
           {
               CustomClient c;
               auto start = std::chrono::steady_clock::now();
               constexpr std::chrono::duration<int> timeOut = std::chrono::seconds(3);
               while (true)
               {

               }
               c.Connect("127.0.0.1", 6767);

               if (c.IsConnected())
               {
                   if (!c.Incoming().empty())
                   {
                       auto msg = c.Incoming().pop_front().msg;

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
                           c.Send(msgOut);
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
                   c.Send(msg_out);

               }
               else
               {
                   std::cout << "Server Down\n";
                   bQuit = true;
               }

           }
       }; // end game client

       gameConnectThread = std::thread(GameServer);

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
          if (gameboard.IsWithinBounds(piece->GetGamePiece(), piece->GetHeading(), {pos.x + 1, pos.y}))
            pos.x += 1;
           
       if (GetKey(olc::Key::LEFT).bPressed)
          if (gameboard.IsWithinBounds(piece->GetGamePiece(), piece->GetHeading(), { pos.x - 1, pos.y }))
            pos.x += -1;

       if (GetKey(olc::Key::UP).bPressed)
          if (gameboard.IsWithinBounds(piece->GetGamePiece(), piece->GetHeading(), { pos.x, pos.y - 1}))
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
