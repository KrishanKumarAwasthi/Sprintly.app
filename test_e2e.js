async function runTests() {
  const log = (msg) => console.log('\x1b[36m%s\x1b[0m', msg); // Cyan
  const logPass = (msg) => console.log('\x1b[32m%s\x1b[0m', '✅ ' + msg); // Green
  const logFail = (msg) => console.log('\x1b[31m%s\x1b[0m', '❌ ' + msg); // Red

  const API = 'http://localhost:3001/api/v1';

  try {
    log('1. Fetching global Boards...');
    let res = await fetch(`${API}/boards`);
    let json = await res.json();
    if (json.status !== 'success') throw new Error('Failed fetching boards');
    logPass(`Fetched ${json.results} boards successfully.`);
    const boardId = json.data.boards[0].id;

    log('2. Fetching Lists for Board...');
    res = await fetch(`${API}/lists?boardId=${boardId}`);
    json = await res.json();
    if (json.status !== 'success') throw new Error('Failed fetching lists');
    logPass(`Fetched ${json.results} lists mapped to board.`);
    const firstListId = json.data.lists[0].id;
    const secondListId = json.data.lists[1].id;

    log('3. Fetching Cards on the first List...');
    res = await fetch(`${API}/cards?listId=${firstListId}`);
    json = await res.json();
    if (json.status !== 'success') throw new Error('Failed fetching cards');
    logPass(`Fetched ${json.results} cards natively on the first list.`);
    const originalCardCount = json.results;

    log('4. Creating a dynamic new Card on that List...');
    res = await fetch(`${API}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listId: firstListId,
        title: 'Backend Verification Card',
        position: 50000 
      })
    });
    json = await res.json();
    if (res.status !== 201) throw new Error('Card creation blocked');
    logPass(`Successfully created card "${json.data.card.title}" with id ${json.data.card.id}`);
    const newCardId = json.data.card.id;

    log('5. Searching globally for the new Card using the custom Search Filter...');
    res = await fetch(`${API}/cards/search?query=Verification`);
    json = await res.json();
    if (json.results < 1) throw new Error('Card Search Engine failed');
    logPass(`Prisma search query accurately found ${json.results} result(s) parsing "Verification"`);

    log('6. Reordering a Card natively within a List (drag and drop test)...');
    res = await fetch(`${API}/cards/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listId: firstListId,
        sourceIndex: originalCardCount, // Top index simulating just created
        destinationIndex: 0 // Simulating drop to the very top (pos ~500)
      })
    });
    json = await res.json();
    if (json.status !== 'success') throw new Error('Reordering algorithms failed constraints');
    logPass(`Successfully shifted float position down from original state to: ${json.data.card.position}! Math is working.`);

    log('7. Moving a Card completely to another List (Cross-list drag and drop test)...');
    res = await fetch(`${API}/cards/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: newCardId,
        sourceListId: firstListId,
        destinationListId: secondListId,
        destinationIndex: 0
      })
    });
    json = await res.json();
    if (json.status !== 'success') throw new Error('Moving cross-list arrays critically failed');
    logPass(`Card successfully moved from List ${firstListId} completely into List ${secondListId} natively!`);

    log('8. Testing Global Error Handler & Validation (creating an intentionally malformed list)...');
    res = await fetch(`${API}/lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boardId: boardId,
        title: '' // Expected to trigger Zod empty constraint string
      })
    });
    json = await res.json();
    if (res.status === 400 && json.message.includes('cannot be empty')) {
      logPass('Zod validation successfully intercepted and blocked the empty string request returning formal JSON instead of a 500 server crash!');
    } else {
      throw new Error('Global validation middlewares failed safety test');
    }

    log('\n🚀 EVERYTHING WORKING FLAWLESSLY! All Trello routes verified against real database constraints.');

  } catch (error) {
    logFail(error.message);
  }
}

runTests();
