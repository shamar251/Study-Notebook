const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

fetch('http://localhost:3001/api/rag', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    note_id: 'test',
    query: 'test',
    allBlocks: [],
    folder_id: 'test'
  })
})
  .then(res => res.text())
  .then(text => {
    console.log('Response:', text);
  })
  .catch(err => {
    console.error('Error:', err);
  }); 