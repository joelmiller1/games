#pragma once
#include "olcPixelGameEngine.h"
#include "GamePieces.h"

#define ROT_IN_RADS   1.5707963267948f
#define PIXEL_WIDTH   15

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