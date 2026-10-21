-- Profile iplant-block-extraction-v1; SELECT only. Bind @EstateID, @FromDate, @ToDate and @Year.
SELECT 'Crop' Source,c.BlockID,COUNT(*) Rows FROM Checkroll.CropStatement c WHERE c.EstateID=@EstateID GROUP BY c.BlockID
UNION ALL SELECT 'Reception',BlockID,COUNT(*) FROM Checkroll.DailyReceiption WHERE EstateID=@EstateID GROUP BY BlockID
UNION ALL SELECT 'Store issue',BlockID,COUNT(*) FROM Store.STIssueDetails WHERE EstateID=@EstateID GROUP BY BlockID
UNION ALL SELECT 'Checkroll ledger',Block,COUNT(*) FROM dbo.CheckrollTemp WHERE Location=@EstateID GROUP BY Block
UNION ALL SELECT 'Vehicle distribution',BlockID,COUNT(*) FROM Vehicle.VHDistribution WHERE EstateID=@EstateID GROUP BY BlockID
UNION ALL SELECT 'Journal',BlockID,COUNT(*) FROM Accounts.JournalDetail WHERE EstateID=@EstateID GROUP BY BlockID;
SELECT h.BlockID,h.BlockName,MIN(h.AYear*100+h.AMonth) FirstPeriod,MAX(h.AYear*100+h.AMonth) LastPeriod,COUNT(*) Rows FROM Accounts.BlockMasterHistory h WHERE h.EstateID=@EstateID GROUP BY h.BlockID,h.BlockName ORDER BY h.BlockID,h.BlockName;
SELECT YEAR(r.DDate) Year,r.BlockID,b.BlockName,r.StationID,COUNT(*) Rows,SUM(r.RainfallMM) RawRainfallMM FROM Checkroll.RainFall r LEFT JOIN General.BlockMaster b ON b.BlockID=r.BlockID AND b.EstateID=r.EstateID WHERE r.EstateID=@EstateID GROUP BY YEAR(r.DDate),r.BlockID,b.BlockName,r.StationID ORDER BY Year,b.BlockName;
SELECT TOP (8) r.TransDate,a.AYear,a.AMonth,r.JDDescp,r.Category,r.DebitValue,r.CreditValue,b.BlockName FROM dbo.CheckrollTemp r JOIN General.ActiveMonthYear a ON a.ActiveMonthYearID=r.ActiveMonthYear AND a.EstateID=r.Location LEFT JOIN General.BlockMaster b ON b.BlockID=r.Block AND b.EstateID=r.Location WHERE r.Location=@EstateID AND a.AYear=@Year AND b.BlockName='04LB1' ORDER BY r.TransDate DESC,r.Id;
