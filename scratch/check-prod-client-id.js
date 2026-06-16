async function run() {
  try {
    const htmlRes = await fetch('https://oxide.chemicalfarmers.com/login');
    const html = await htmlRes.text();
    const match = html.match(/src="([^"]+index-[^"]+\.js)"/);
    if (!match) return;
    const jsUrl = 'https://oxide.chemicalfarmers.com' + match[1];
    const jsRes = await fetch(jsUrl);
    const js = await jsRes.text();
    
    const index = js.indexOf('function jv()');
    if (index !== -1) {
      console.log('Signup component code:');
      console.log(js.substring(index, index + 2500));
    }
  } catch (err) {
    console.error('Error:', err);
  }
}
run();
