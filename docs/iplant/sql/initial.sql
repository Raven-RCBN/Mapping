-- Profile iplant-block-extraction-v1; SELECT only. Bind @EstateID, @FromDate, @ToDate and @Year.
SELECT DB_NAME() DatabaseName, GETDATE() QueriedAt;
SELECT EstateID,EstateCode,EstateName,CompanyName FROM General.Estate;
SELECT s.name SchemaName,t.name TableName,SUM(p.rows) ApproxRows FROM sys.tables t JOIN sys.schemas s ON t.schema_id=s.schema_id JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1) GROUP BY s.name,t.name ORDER BY s.name,t.name;
