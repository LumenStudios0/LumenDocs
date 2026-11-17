CREATE TRIGGER lumen_points_credit_notice AFTER INSERT ON lumen_points_history WHEN NEW.delta_units>0
BEGIN
  INSERT INTO community_notifications(id,recipient_id,title,body,kind,audience,link,created_at)
  VALUES('points:earn:'||NEW.id,NEW.user_id,'Lumen Points received',
    printf('You received %.2f LP. %s. View your wallet for your current balance.',NEW.delta_units/100.0,NEW.label),
    'license','user','/account/points',NEW.created_at);
END;
CREATE TRIGGER lumen_points_adjustment_notice AFTER INSERT ON lumen_points_adjustments
BEGIN
  INSERT INTO community_notifications(id,recipient_id,title,body,kind,audience,link,created_at)
  VALUES('points:adjust:'||NEW.id,NEW.user_id,CASE WHEN NEW.delta_units>0 THEN 'Lumen Points received' ELSE 'Lumen Points adjusted' END,
    printf('%s %.2f LP. %s.%s View your wallet for your current balance.',
      CASE WHEN NEW.delta_units>0 THEN 'You received' ELSE 'Deducted' END,ABS(NEW.delta_units)/100.0,NEW.label,
      CASE WHEN NEW.reason='' THEN '' ELSE ' Reason: '||NEW.reason END),
    'license','user','/account/points',NEW.created_at);
END;
CREATE TRIGGER lumen_points_refund_notice AFTER INSERT ON lumen_points_shop_events WHEN NEW.delta_units>0
BEGIN
  INSERT INTO community_notifications(id,recipient_id,title,body,kind,audience,link,created_at)
  VALUES('points:refund:'||NEW.id,NEW.user_id,'Lumen Points returned',
    printf('%.2f LP returned. %s. View your wallet for your current balance.',NEW.delta_units/100.0,NEW.label),
    'license','user','/account/points',NEW.created_at);
END;
INSERT OR IGNORE INTO community_notifications(id,recipient_id,title,body,kind,audience,link,created_at)
SELECT 'points:earn:'||id,user_id,'Your previous Lumen Points credit',
  printf('You were credited %.2f LP for %s on %s. This is a notice for an existing credit, not a second award. View your current balance and transactions in Lumen Points.',
    delta_units/100.0,label,created_at),
  'license','user','/account/points',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM lumen_points_history WHERE delta_units>0;
INSERT OR IGNORE INTO community_notifications(id,recipient_id,title,body,kind,audience,link,created_at)
SELECT 'points:refund:'||id,user_id,'Your previous Lumen Points refund',
  printf('%.2f LP was returned for %s on %s. This notice does not award points again. View your wallet for the current balance.',
    delta_units/100.0,label,created_at),
  'license','user','/account/points',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM lumen_points_shop_events WHERE delta_units>0;
