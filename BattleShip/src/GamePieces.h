#pragma once
#include "olcPixelGameEngine.h"

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
