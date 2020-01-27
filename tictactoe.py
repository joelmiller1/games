# -*- coding: utf-8 -*-
"""
Created on Thu Jan 23 09:59:06 2020

@author: Joel Miller
"""
import random
import numpy as np

xReplace = lambda b,p: b[:p] + 'X' + b[p+1:]
oReplace = lambda b,p: b[:p] + 'O' + b[p+1:]
winCombo = [[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]]

def blockSpots(availablePositions):
    spotList = []
    for i in list(range(len(winCombo))):
        for j in xPos:
            if j in winCombo[i]:
                spotList.append(i)
    # find available positions in order to block X
    goodSpot = set()
    for i in spotList:
        for j in availablePositions:
            if j in winCombo[i]:
                goodSpot.add(j)
    return list(goodSpot)

def updateGoodSpots(availablePositions,rank):
    for i in availablePositions:
        rank[i-1] += 1
    return rank

def oMoveRandom(board,availablePositions,oPos):
    oPlace = random.randint(1,9)
    while oPlace not in availablePositions:
        oPlace = random.randint(1,9)
    oPos.append(oPlace)
    availablePositions.remove(oPlace)
    board = oReplace(board,position[oPlace-1])
    return board, availablePositions, oPos


def oMoveHardDifficulty(board,availablePositions,oPos,xPos):
    rank = np.zeros(9)
    for i in xPos:
        rank[i-1] = -1
    
    # on first O move:
    if len(xPos) == 1:
        center = 5
        if center in availablePositions:
            oPos.append(center)
            availablePositions.remove(center)
            board = oReplace(board,position[center-1])
        else:
            blockSpot = blockSpots(availablePositions)
            # update rank based on how to block X
            rank = updateGoodSpots(blockSpot,rank)
            # update rank based on better spots to move
            rank = updateGoodSpots([1,3,7,9],rank)
            maxVal = max(rank)
            maxRanks = [i for i,j in enumerate(rank) if j == maxVal]
            random.shuffle(maxRanks)
            oSpot = maxRanks.pop()
            oPos.append(oSpot)
            availablePositions.remove(oSpot)
            board = oReplace(board,position[oSpot])
    # on second and futher moves, check to see if current move can win, otherwise block
    else:
        # check for win first
        moveList = []
        for i in list(range(len(winCombo))):
            vectorCount = 0
            winComboSpots = []
            for j in oPos:
                if j in winCombo[i] and j in availablePositions:
                    moveList.append(i)
                    winComboSpots.append(j)
                    vectorCount += 1
            # if there are two spots in a winning combination, move to third Spot to finish win
            if vectorCount == 2:
                oSpot = list(set(winCombo[i]) - set(winComboSpots))
                oSpot = oSpot.pop()
                oPos.append(oSpot)
                availablePositions.remove(oSpot)
                board = oReplace(board,position[oSpot])
                return board, availablePositions, oPos
            
        # find a spot to block
        board, availablePositions, oPos = oMoveRandom(board,availablePositions,oPos)
                
        
    return board, availablePositions, oPos
    

def checkWin(Pos):
    if len(Pos) > 2:
        for i in winCombo:
            temp = []
            for j in Pos:
                if j in i:
                    temp.append(j)
            temp = sorted(temp)
            if temp in winCombo:
                return 1
    return 0

while True:
    board = "\n _ _ _\n|_|_|_|\n|_|_|_|\n|_|_|_|"
    position = [9,11,13,17,19,21,25,27,29]
    availablePositions = [1,2,3,4,5,6,7,8,9]
    xPos = []
    oPos = []
    while True:
        print(board)
        print("available Positions: ")
        print(availablePositions)
        enteredXPos = input("enter position of where to move (you are X): ")
        try:
            enteredXPos = int(enteredXPos)
        except:
            "wrong type of input"
        if enteredXPos in availablePositions:
            xPos.append(enteredXPos)
            availablePositions.remove(enteredXPos)
            board = xReplace(board, position[enteredXPos-1])
            win = checkWin(xPos)
            if win:
                print(board)
                print("you won!")
                break
            if not availablePositions:
                print(board)
                print("cats game")
                break
            board, availablePositions, oPos = oMoveHardDifficulty(board,availablePositions,oPos,xPos)
            win = checkWin(oPos)
            if win:
                print(board)
                print("you lost :(")
                break
        else:
            print("invalid move")
    playInput = input("play again? (n to exit) ")
    if playInput == 'n':
        break
print("goodbye!")

        

