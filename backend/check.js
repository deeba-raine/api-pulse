const url = "https://jsonplaceholder.typicode.com/users";

async function check() {
  const start = Date.now();
  try {
    const res = await fetch(url);
    console.log(`${url} -> ${res.status} in ${Date.now() - start} ms`);
  } catch (err) {
    console.log(`${url} -> DOWN (${err.message})`);
  }
}

check();