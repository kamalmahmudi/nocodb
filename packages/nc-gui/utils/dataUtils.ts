import { RelationTypes, UITypes } from 'nocodb-sdk'
import type { ColumnType, LinkToAnotherRecordType, TableType } from 'nocodb-sdk'

export const extractPkFromRow = (row: Record<string, any>, columns: ColumnType[]) => {
  return (
    row &&
    columns
      ?.filter((c) => c.pk)
      .map((c) => row?.[c.title as string])
      .join('___')
  )
}

// a function to populate insert object and verify if all required fields are present
export async function populateInsertObject({
  getMeta,
  row,
  meta,
  ltarState,
  throwError,
}: {
  meta: TableType
  ltarState: Record<string, any>
  getMeta: (tableIdOrTitle: string, force?: boolean) => Promise<TableType | null>
  row: Record<string, any>
  throwError?: boolean
}) {
  const missingRequiredColumns = new Set()
  const insertObj = await meta.columns?.reduce(async (_o: Promise<any>, col) => {
    const o = await _o

    // if column is BT relation then check if foreign key is not_null(required)
    if (
      ltarState &&
      col.uidt === UITypes.LinkToAnotherRecord &&
      (<LinkToAnotherRecordType>col.colOptions).type === RelationTypes.BELONGS_TO
    ) {
      if (ltarState[col.title!]) {
        const colOpt = <LinkToAnotherRecordType>col.colOptions
        const childCol = meta.columns!.find((c) => colOpt.fk_child_column_id === c.id)
        const relatedTableMeta = (await getMeta(colOpt.fk_related_model_id!)) as TableType
        if (relatedTableMeta && childCol) {
          o[childCol.title!] =
            ltarState[col.title!][relatedTableMeta!.columns!.find((c) => c.id === colOpt.fk_parent_column_id)!.title!]
          missingRequiredColumns.delete(childCol.title)
        }
      }
    }
    // check all the required columns are not null
    if (isColumnRequiredAndNull(col, row)) {
      missingRequiredColumns.add(col.title)
    }

    if (!col.ai && row?.[col.title as string] !== null) {
      o[col.title as string] = row?.[col.title as string]
    }

    return o
  }, Promise.resolve({}))

  if (throwError && missingRequiredColumns.size) {
    throw new Error(`Missing required columns: ${[...missingRequiredColumns].join(', ')}`)
  }

  return { missingRequiredColumns, insertObj }
}
