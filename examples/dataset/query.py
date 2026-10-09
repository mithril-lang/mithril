import duckdb

result = duckdb.sql("SELECT count(*) FROM read_parquet('dataset-output/devices.parquet')").fetchone()
assert result[0] == 2000
print({"sql_quad_count": result[0]})
