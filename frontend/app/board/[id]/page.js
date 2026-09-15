"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import BoardHeader from "@/components/BoardHeader";
import BottomNav from "@/components/BottomNav";
import KanbanList from "@/components/KanbanList";
import SprintlyAI from "@/components/SprintlyAI";
import * as api from "../../lib/api";

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.id;

  const [allBoards, setAllBoards] = useState([]);
  const [board, setBoard] = useState(null);
  const [lists, setLists] = useState([]);
  const [cardsByList, setCardsByList] = useState({}); // { listId: [cards] }
  const [labels, setLabels] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddList, setShowAddList] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const [showLabelNames, setShowLabelNames] = useState(false);
  const [filters, setFilters] = useState({ query: "", labelId: "", memberId: "", dueDate: "" });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Ref for filters to avoid stale closure in applyFilters
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const loadAllBoards = useCallback(async () => {
    try {
      const res = await api.getBoards();
      setAllBoards(res.data.boards);
    } catch (err) {
      console.error("Failed to load boards:", err);
    }
  }, []);

  // Load a specific board by ID
  const loadBoardData = useCallback(async (id) => {
    if (!id) return;
    try {
      setLoading(true);
      const boardRes = await api.getBoard(id);
      const theBoard = boardRes.data.board;
      setBoard(theBoard);

      const listRes = await api.getListsByBoard(theBoard.id);
      const sortedLists = listRes.data.lists.sort((a, b) => a.position - b.position);
      setLists(sortedLists);

      const cardsMap = {};
      await Promise.all(
        sortedLists.map(async (list) => {
          const cardRes = await api.getCardsByList(list.id);
          cardsMap[list.id] = cardRes.data.cards.sort((a, b) => a.position - b.position);
        })
      );

      const labelsRes = await api.getLabels();
      setLabels(labelsRes.data.labels);

      const membersRes = await api.getMembers();
      setMembers(membersRes.data.members);

      setCardsByList(cardsMap);
      setFilters({ query: "", labelId: "", memberId: "", dueDate: "" });
    } catch (err) {
      console.error("Failed to load board data:", err);
      // If board not found, maybe redirect to home
      // router.push("/");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllBoards();
  }, [loadAllBoards]);

  useEffect(() => {
    if (boardId) {
      loadBoardData(boardId);
    }
  }, [boardId, loadBoardData]);

  const handleSwitchBoard = useCallback((id) => {
    setIsMobileSidebarOpen(false);
    router.push(`/board/${id}`);
  }, [router]);

  const handleArchiveCard = useCallback(async (cardId) => {
    try {
      await api.archiveCard(cardId);
      setCardsByList((prev) => {
        const newState = { ...prev };
        for (const listId in newState) {
          newState[listId] = newState[listId].filter((c) => c.id !== cardId);
        }
        return newState;
      });
    } catch (err) {
      console.error("Failed to archive card:", err);
    }
  }, []);

  const handleAddCard = useCallback(async (listId, title, description, dueDate) => {
    try {
      const existingCards = cardsByList[listId] || [];
      const maxPos = existingCards.length > 0
        ? Math.max(...existingCards.map((c) => c.position))
        : 0;

      const res = await api.createCard({
        listId,
        title,
        description,
        dueDate,
        position: maxPos + 1000,
      });

      setCardsByList((prev) => ({
        ...prev,
        [listId]: [...(prev[listId] || []), res.data.card],
      }));
    } catch (err) {
      console.error("Failed to add card:", err);
    }
  }, [cardsByList]);

  const handleDropCard = useCallback(async (cardId, sourceListId, destListId, destIndex) => {
    try {
      if (sourceListId === destListId) {
        const cards = cardsByList[sourceListId] || [];
        const sourceIndex = cards.findIndex((c) => c.id === cardId);
        if (sourceIndex === -1 || sourceIndex === destIndex) return;

        const updated = [...cards];
        const [moved] = updated.splice(sourceIndex, 1);
        updated.splice(destIndex, 0, moved);
        setCardsByList((prev) => ({ ...prev, [sourceListId]: updated }));

        await api.reorderCard({ listId: sourceListId, sourceIndex, destinationIndex: destIndex });
      } else {
        const sourceCards = [...(cardsByList[sourceListId] || [])];
        const destCards = [...(cardsByList[destListId] || [])];
        const cardIndex = sourceCards.findIndex((c) => c.id === cardId);
        if (cardIndex === -1) return;

        const [movedCard] = sourceCards.splice(cardIndex, 1);
        movedCard.listId = destListId;
        destCards.splice(destIndex, 0, movedCard);

        setCardsByList((prev) => ({
          ...prev,
          [sourceListId]: sourceCards,
          [destListId]: destCards,
        }));

        await api.moveCard({ cardId, sourceListId, destinationListId: destListId, destinationIndex: destIndex });
      }
    } catch (err) {
      console.error("Failed to move card:", err);
      loadBoardData(boardId);
    }
  }, [cardsByList, boardId, loadBoardData]);

  const handleReorderList = useCallback(async (sourceIndex, destIndex) => {
    if (sourceIndex === destIndex || !board) return;
    try {
      const reordered = [...lists];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(destIndex, 0, moved);
      setLists(reordered);

      await api.reorderList({ boardId: board.id, sourceIndex, destinationIndex: destIndex });
    } catch (err) {
      console.error("Failed to reorder list:", err);
      loadBoardData(boardId);
    }
  }, [board, lists, boardId, loadBoardData]);

  const handleCreateBoard = useCallback(async (title) => {
    try {
      const res = await api.createBoard(title);
      const newBoard = res.data.board;
      setAllBoards((prev) => [...prev, newBoard]);
      router.push(`/board/${newBoard.id}`);
    } catch (err) {
      console.error("Failed to create board:", err);
    }
  }, [router]);

  const handleUpdateList = useCallback(async (listId, newTitle) => {
    try {
      setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, title: newTitle } : l)));
      await api.updateList(listId, { title: newTitle });
    } catch (err) {
      console.error("Failed to update list:", err);
      loadBoardData(boardId);
    }
  }, [boardId, loadBoardData]);

  const handleDeleteList = useCallback(async (listId) => {
    try {
      setLists((prev) => prev.filter((l) => l.id !== listId));
      setCardsByList((prev) => {
        const next = { ...prev };
        delete next[listId];
        return next;
      });
      await api.deleteList(listId);
    } catch (err) {
      console.error("Failed to delete list:", err);
      loadBoardData(boardId);
    }
  }, [boardId, loadBoardData]);

  const handleUpdateCard = useCallback(async (cardId, data) => {
    try {
      setCardsByList((prev) => {
        const next = { ...prev };
        for (const lid in next) {
          const idx = next[lid].findIndex((c) => c.id === cardId);
          if (idx !== -1) {
            const updatedCards = [...next[lid]];
            updatedCards[idx] = { ...updatedCards[idx], ...data };
            next[lid] = updatedCards;
            break;
          }
        }
        return next;
      });
      await api.updateCard(cardId, data);
    } catch (err) {
      console.error("Failed to update card:", err);
      loadBoardData(boardId);
    }
  }, [boardId, loadBoardData]);

  const handleDeleteCard = useCallback(async (cardId) => {
    try {
      setCardsByList((prev) => {
        const next = { ...prev };
        for (const lid in next) {
          const idx = next[lid].findIndex((c) => c.id === cardId);
          if (idx !== -1) {
            next[lid] = next[lid].filter((c) => c.id !== cardId);
            break;
          }
        }
        return next;
      });
      await api.deleteCard(cardId);
    } catch (err) {
      console.error("Failed to delete card:", err);
      loadBoardData(boardId);
    }
  }, [boardId, loadBoardData]);

  const handleAddLabel = useCallback(async (cardId, labelId) => {
    try {
      await api.addLabelToCard(cardId, labelId);
      setCardsByList((prev) => {
        const next = { ...prev };
        for (const lid in next) {
          const idx = next[lid].findIndex((c) => c.id === cardId);
          if (idx !== -1) {
            const updatedCard = { ...next[lid][idx] };
            const labelObj = labels.find(l => l.id === labelId);
            updatedCard.labels = [...(updatedCard.labels || []), { labelId, label: labelObj }];
            next[lid] = next[lid].map((c, i) => i === idx ? updatedCard : c);
            break;
          }
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to add label:", err);
    }
  }, [labels]);

  const handleRemoveLabel = useCallback(async (cardId, labelId) => {
    try {
      await api.removeLabelFromCard(cardId, labelId);
      setCardsByList((prev) => {
        const next = { ...prev };
        for (const lid in next) {
          const idx = next[lid].findIndex((c) => c.id === cardId);
          if (idx !== -1) {
            const updatedCard = { ...next[lid][idx] };
            updatedCard.labels = (updatedCard.labels || []).filter(l => l.labelId !== labelId);
            next[lid] = next[lid].map((c, i) => i === idx ? updatedCard : c);
            break;
          }
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to remove label:", err);
    }
  }, []);

  const handleCreateLabel = useCallback(async (name, color) => {
    try {
      const res = await api.createLabel({ name, color });
      setLabels((prev) => [...prev, res.data.label]);
      return res.data.label;
    } catch (err) {
      console.error("Failed to create label:", err);
    }
  }, []);

  const handleDeleteLabel = useCallback(async (labelId) => {
    try {
      await api.deleteLabel(labelId);
      setLabels((prev) => prev.filter((l) => l.id !== labelId));
      setCardsByList((prev) => {
        const next = { ...prev };
        for (const lid in next) {
          next[lid] = next[lid].map((card) => ({
            ...card,
            labels: (card.labels || []).filter((l) => l.labelId !== labelId),
          }));
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to delete label:", err);
    }
  }, []);

  const toggleShowLabelNames = useCallback(() => {
    setShowLabelNames(prev => !prev);
  }, []);

  const handleAssignMember = useCallback(async (cardId, memberId) => {
    try {
      await api.assignMemberToCard(cardId, memberId);
      const memberObj = members.find(m => m.id === memberId);
      setCardsByList((prev) => {
        const next = { ...prev };
        for (const lid in next) {
          const idx = next[lid].findIndex((c) => c.id === cardId);
          if (idx !== -1) {
            const updatedCard = { ...next[lid][idx] };
            updatedCard.members = [...(updatedCard.members || []), { memberId, member: memberObj }];
            next[lid] = next[lid].map((c, i) => i === idx ? updatedCard : c);
            break;
          }
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to assign member:", err);
    }
  }, [members]);

  const handleRemoveMember = useCallback(async (cardId, memberId) => {
    try {
      await api.removeMemberFromCard(cardId, memberId);
      setCardsByList((prev) => {
        const next = { ...prev };
        for (const lid in next) {
          const idx = next[lid].findIndex((c) => c.id === cardId);
          if (idx !== -1) {
            const updatedCard = { ...next[lid][idx] };
            updatedCard.members = (updatedCard.members || []).filter(m => m.memberId !== memberId);
            next[lid] = next[lid].map((c, i) => i === idx ? updatedCard : c);
            break;
          }
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  }, []);

  const handleCreateMember = useCallback(async (name) => {
    try {
      const res = await api.createMember({ name });
      setMembers((prev) => [...prev, res.data.member]);
      return res.data.member;
    } catch (err) {
      console.error("Failed to create member:", err);
    }
  }, []);

  const handleDeleteMember = useCallback(async (memberId) => {
    try {
      await api.deleteMember(memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      setCardsByList((prev) => {
        const next = { ...prev };
        for (const lid in next) {
          next[lid] = next[lid].map((card) => ({
            ...card,
            members: (card.members || []).filter((m) => m.memberId !== memberId),
          }));
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to delete member:", err);
    }
  }, []);

  const handleAddChecklist = useCallback(async (cardId) => {
    try {
      const res = await api.createChecklist(cardId);
      setCardsByList((prev) => {
        const next = { ...prev };
        for (const lid in next) {
          const idx = next[lid].findIndex(c => c.id === cardId);
          if (idx !== -1) {
            const updatedCard = { ...next[lid][idx] };
            updatedCard.checklists = [...(updatedCard.checklists || []), { ...res.data.checklist, items: [] }];
            next[lid] = next[lid].map((c, i) => i === idx ? updatedCard : c);
            break;
          }
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to add checklist:", err);
    }
  }, []);

  const handleAddItemToChecklist = useCallback(async (cardId, checklistId, content) => {
    try {
      const res = await api.addChecklistItem(checklistId, content);
      setCardsByList((prev) => {
        const next = { ...prev };
        for (const lid in next) {
          const idx = next[lid].findIndex(c => c.id === cardId);
          if (idx !== -1) {
            const updatedCard = { ...next[lid][idx] };
            updatedCard.checklists = updatedCard.checklists.map(cl => {
              if (cl.id === checklistId) {
                return { ...cl, items: [...(cl.items || []), res.data.item] };
              }
              return cl;
            });
            next[lid] = next[lid].map((c, i) => i === idx ? updatedCard : c);
            break;
          }
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to add checklist item:", err);
    }
  }, []);

  const handleToggleChecklistItem = useCallback(async (cardId, checklistId, itemId, completed) => {
    try {
      const res = await api.toggleChecklistItem(itemId, completed);
      setCardsByList((prev) => {
        const next = { ...prev };
        for (const lid in next) {
          const idx = next[lid].findIndex(c => c.id === cardId);
          if (idx !== -1) {
            const updatedCard = { ...next[lid][idx] };
            updatedCard.checklists = updatedCard.checklists.map(cl => {
              if (cl.id === checklistId) {
                return {
                  ...cl,
                  items: cl.items.map(it => it.id === itemId ? res.data.item : it)
                };
              }
              return cl;
            });
            next[lid] = next[lid].map((c, i) => i === idx ? updatedCard : c);
            break;
          }
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to toggle item status:", err);
    }
  }, []);

  const handleDeleteChecklistItem = useCallback(async (cardId, checklistId, itemId) => {
    try {
      await api.deleteChecklistItem(itemId);
      setCardsByList((prev) => {
        const next = { ...prev };
        for (const lid in next) {
          const idx = next[lid].findIndex(c => c.id === cardId);
          if (idx !== -1) {
            const updatedCard = { ...next[lid][idx] };
            updatedCard.checklists = updatedCard.checklists.map(cl => {
              if (cl.id === checklistId) {
                return {
                  ...cl,
                  items: cl.items.filter(it => it.id !== itemId)
                };
              }
              return cl;
            });
            next[lid] = next[lid].map((c, i) => i === idx ? updatedCard : c);
            break;
          }
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  }, []);

  const handleAddList = useCallback(async (e) => {
    e.preventDefault();
    if (!newListTitle.trim()) return;
    try {
      const maxPos = lists.length > 0 ? Math.max(...lists.map((l) => l.position)) : 0;
      const res = await api.createList({
        boardId: board.id,
        title: newListTitle.trim(),
        position: maxPos + 1000,
      });
      setLists((prev) => [...prev, res.data.list]);
      setCardsByList((prev) => ({ ...prev, [res.data.list.id]: [] }));
      setNewListTitle("");
      setShowAddList(false);
    } catch (err) {
      console.error("Failed to add list:", err);
    }
  }, [board, lists, newListTitle]);

  const searchTimeoutRef = useRef(null);

  const applyFilters = useCallback(async (newFilters) => {
    try {
      const active = { ...filtersRef.current, ...newFilters };
      setFilters(active);

      if (!active.query && !active.labelId && !active.memberId && !active.dueDate) {
        const cardsMap = {};
        await Promise.all(
          lists.map(async (list) => {
            const cardRes = await api.getCardsByList(list.id);
            cardsMap[list.id] = cardRes.data.cards.sort((a, b) => a.position - b.position);
          })
        );
        setCardsByList(cardsMap);
        return;
      }

      const res = await api.searchCards(active);
      const grouped = {};
      lists.forEach(l => grouped[l.id] = []);
      for (const card of res.data.cards) {
        if (!grouped[card.listId]) grouped[card.listId] = [];
        grouped[card.listId].push(card);
      }
      setCardsByList(grouped);
    } catch (err) {
      console.error("Filtering failed:", err);
    }
  }, [lists]);

  const handleSearch = useCallback((query) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      applyFilters({ query });
    }, 300);
  }, [applyFilters]);

  const handleFilterChange = useCallback((type, value) => {
    applyFilters({ [type]: value });
  }, [applyFilters]);

  const clearFilters = useCallback(async () => {
    setFilters({ query: "", labelId: "", memberId: "", dueDate: "" });
    const cardsMap = {};
    await Promise.all(
      lists.map(async (list) => {
        const cardRes = await api.getCardsByList(list.id);
        cardsMap[list.id] = cardRes.data.cards.sort((a, b) => a.position - b.position);
      })
    );
    setCardsByList(cardsMap);
  }, [lists]);

  const handleListDragStart = useCallback((e, listIndex) => {
    e.dataTransfer.setData("dragType", "list");
    e.dataTransfer.setData("listIndex", String(listIndex));
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleListDrop = useCallback((e, destIndex) => {
    e.preventDefault();
    const dragType = e.dataTransfer.getData("dragType");
    if (dragType !== "list") return;
    const sourceIndex = parseInt(e.dataTransfer.getData("listIndex"), 10);
    if (isNaN(sourceIndex)) return;
    handleReorderList(sourceIndex, destIndex);
  }, [handleReorderList]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#1D2125]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#579DFF] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[#B6C2CF] text-sm font-medium">Loading board...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#1D2125] text-[#B6C2CF] overflow-hidden font-sans">
      <Header
        onSearch={handleSearch}
        onCreateBoard={handleCreateBoard}
        boardTitle={board?.title}
        onToggleSidebar={() => setIsMobileSidebarOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden min-h-0 relative">
        {isMobileSidebarOpen && (
          <button
            aria-label="Close boards sidebar"
            className="md:hidden absolute inset-0 bg-black/40 z-40"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}
        <Sidebar 
          boards={allBoards} 
          currentBoardId={board?.id} 
          onSwitchBoard={handleSwitchBoard}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          isDesktopCollapsed={isSidebarCollapsed}
          onToggleDesktopCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        />
        <main className="flex-1 min-w-0 relative overflow-hidden flex flex-col">
          {/* Deep Dark Sprintly Background */}
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            {/* Dark Charcoal Navy Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#8B4A7A] via-[#A35B8E] to-[#7A3D6E]"></div>
          </div>

          <BoardHeader 
            title={board?.title} 
            allLabels={labels} 
            allMembers={members}
            filters={filters}
            onFilterChange={handleFilterChange}
            onClearFilters={clearFilters}
          />
          <div className="board-lists-scroll flex-1 px-2 sm:px-3 py-2 md:px-3 md:py-3 lg:p-4 flex items-start gap-2 sm:gap-2.5 md:gap-3 lg:gap-3 overflow-x-auto overflow-y-hidden custom-scrollbar snap-x snap-proximity relative">
            {lists.map((list, i) => (
              <KanbanList
                key={list.id}
                list={list}
                index={i}
                cards={cardsByList[list.id] || []}
                onAddCard={handleAddCard}
                onDropCard={handleDropCard}
                onUpdateList={handleUpdateList}
                onDeleteList={handleDeleteList}
                onUpdateCard={handleUpdateCard}
                onDeleteCard={handleDeleteCard}
                onArchiveCard={handleArchiveCard}
                allLabels={labels}
                onAddLabel={handleAddLabel}
                onRemoveLabel={handleRemoveLabel}
                onCreateLabel={handleCreateLabel}
                onDeleteLabel={handleDeleteLabel}
                showLabelNames={showLabelNames}
                onToggleLabelNames={toggleShowLabelNames}
                allMembers={members}
                onAssignMember={handleAssignMember}
                onRemoveMember={handleRemoveMember}
                onCreateMember={handleCreateMember}
                onDeleteMember={handleDeleteMember}
                onAddChecklist={handleAddChecklist}
                onAddChecklistItem={handleAddItemToChecklist}
                onToggleChecklistItem={handleToggleChecklistItem}
                onDeleteChecklistItem={handleDeleteChecklistItem}
                onListDragStart={handleListDragStart}
                onListDrop={handleListDrop}
              />
            ))}
            {showAddList ? (
              <form onSubmit={handleAddList} className="w-[75vw] max-w-[16rem] sm:w-[16rem] sm:max-w-none md:w-[17rem] lg:w-72 shrink-0 bg-[#22272B] border border-white/10 rounded-xl p-2 snap-start">
                <input
                  autoFocus
                  value={newListTitle}
                  onChange={(e) => setNewListTitle(e.target.value)}
                  placeholder="Enter list title..."
                  className="w-full bg-[#1D2125] text-[#FFFFFF] text-xs sm:text-sm rounded-lg p-2 outline-none focus:ring-1 focus:ring-[#579DFF]/50 border border-white/10 placeholder:text-[#B6C2CF]/40"
                  onBlur={() => {
                    if (!newListTitle.trim()) setShowAddList(false);
                  }}
                />
                <div className="flex items-center gap-2 mt-1.5">
                  <button type="submit" className="bg-[#579DFF] text-[#1D2125] text-xs font-bold px-3 py-1 rounded hover:bg-[#85B8FF] transition-colors">
                    Add list
                  </button>
                  <button type="button" onClick={() => setShowAddList(false)} className="text-[#B6C2CF] hover:text-[#FFFFFF]">
                    <span className="material-symbols-outlined text-base sm:text-lg">close</span>
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowAddList(true)}
                className="w-[75vw] max-w-[16rem] sm:w-[16rem] sm:max-w-none md:w-[17rem] lg:w-72 shrink-0 h-10 sm:h-10 bg-white/10 hover:bg-white/15 backdrop-blur-md rounded-xl flex items-center gap-2 sm:gap-3 px-3 sm:px-4 text-[#B6C2CF] hover:text-[#FFFFFF] font-medium transition-all text-xs sm:text-sm border border-white/5 snap-start"
              >
                <span className="material-symbols-outlined text-base sm:text-lg">add</span>
                Add another list
              </button>
            )}
          </div>
          <div className="relative z-20 shrink-0">
            <BottomNav 
              onToggleBoardSwitcher={() => {
                // On mobile: open the overlay sidebar
                // On desktop: expand collapsed sidebar
                if (window.innerWidth < 768) {
                  setIsMobileSidebarOpen(true);
                } else {
                  setIsSidebarCollapsed(prev => !prev);
                }
              }}
            />
          </div>
          {board?.id && <SprintlyAI boardId={board.id} />}
        </main>
      </div>
    </div>
  );
}
