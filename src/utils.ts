import { Database, OPEN_CREATE, OPEN_READWRITE } from "sqlite3";


export function greet(name:string) {
    console.log("hello " + name +  " there!");
}

export function storeDb(urls:string[]) {
    const db = new Database('tori.db',
      OPEN_READWRITE | OPEN_CREATE,
      (err) => {
        if (err){
          console.log(err.message);
        }
        else{
          console.log("Connected to Database");
          db.run("CREATE TABLE IF NOT EXISTS links (url TEXT UNIQUE)");
          const stmt = db.prepare("INSERT INTO links VALUES (?)");
          urls.forEach(url => {
            stmt.run(url, (err) => {
              if (err){
                console.log(err.message)
              }
              else{
                console.log("Added url: ", url);
                const TelegramBot = require('node-telegram-bot-api');
                const bot= new TelegramBot(process.env.TELEGRAM_API_KEY);
                
                bot.sendMessage(process.env.TELEGRAM_CHAT_ID, url);
  
  
              }
            });
          });
          stmt.finalize();
        }
      } 
    )
  }