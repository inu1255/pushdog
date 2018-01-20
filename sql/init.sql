-- 用户表
create table if not exists user (
  id int unsigned auto_increment primary key,
  account varchar(32) default null,
  email varchar(64) default null,
  telphone varchar(11) default null,
  password varchar(32) default null,
  name varchar(32) default null,
  avatar varchar(1024) default null,
  profile varchar(255) default null,
  role varchar(32) default '',
  token varchar(64) default null,
  invite int default 0,
  create_at timestamp default current_timestamp,
  unique key user_account_unique (account),
  unique key user_email_unique (email),
  unique key user_telphone_unique (telphone)
) auto_increment=1024;

-- 验证码表
create table if not exists verify (
  id int unsigned auto_increment primary key,
  title varchar(64) default null,
  code varchar(16) default null,
  rest int(11) default '10',
  update_at bigint not null default 0
);

-- 文件表
create table if not exists file (
  id int unsigned auto_increment primary key,
  uid int(11) default null,
  name varchar(128) default null,
  ext varchar(32) default null,
  md5 varchar(32) default null,
  create_at timestamp default current_timestamp
);

-- service
create table if not exists service(
  id int unsigned auto_increment primary key,
  uid int(11) default null,
  code varchar(16) not null unique key,
  name varchar(32) default "",
  logo varchar(256) default null,
  brief text,
  token varchar(32) default null,
  update_at bigint not null default 0,
  create_at timestamp default current_timestamp
);

-- 订阅
create table if not exists subscribe(
  uid int(11) not null,
  sid int(11) not null,
  create_at timestamp default current_timestamp,
  primary key (uid,sid)
);

-- 通知
create table if not exists notice(
  id int unsigned auto_increment primary key,
  uid int(11) not null,
  sid int(11) not null,
  title varchar(32) not null,
  content varchar(64) not null,
  data text,
  send_at bigint not null default 0,
  read_at bigint not null default 0,
  create_at timestamp default current_timestamp
);