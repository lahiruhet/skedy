import type { Client, InStatement, InValue, ResultSet } from "@libsql/client";
import type { Database, Statement } from "./storage.ts";

type LibsqlStatement = Statement & { readonly statement: InStatement };

function objects(result: ResultSet) { return result.rows.map(row => Object.fromEntries(result.columns.map((column, i) => [column, row[i]]))); }

// Adapts a libSQL/Turso client to the small prepared-statement interface Store uses.
export function libsqlDatabase(client: Client): Database {
  function prepare(sql: string, args: InValue[] = []): LibsqlStatement {
    const statement = { sql, args };
    return {
      statement,
      bind: (...values) => prepare(sql, values as InValue[]),
      run: async () => ({ changes: (await client.execute(statement)).rowsAffected }),
      all: async <T>() => ({ results: objects(await client.execute(statement)) as T[] }),
      first: async <T>() => (objects(await client.execute(statement))[0] as T | undefined) ?? null,
    };
  }
  return { prepare, batch: statements => client.batch(statements.map(s => (s as LibsqlStatement).statement), "write") };
}
