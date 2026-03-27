interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right";
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
}

export function DataTable<T>({ columns, data }: DataTableProps<T>) {
  return (
    <div>
      <div className="grid gap-x-4" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
        {columns.map((col) => (
          <div key={col.key} className={`text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] pb-3 border-b border-[var(--border)] ${col.align === "right" ? "text-right" : ""}`}>
            {col.header}
          </div>
        ))}
      </div>
      {data.map((row, i) => (
        <div key={i} className="grid gap-x-4 data-table-row rounded transition-colors" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
          {columns.map((col) => (
            <div key={`${i}-${col.key}`} className={`py-3 text-[13px] border-b border-[var(--border)] ${col.align === "right" ? "text-right" : ""}`}>
              {col.render(row)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
